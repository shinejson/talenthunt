(function () {
  'use strict';

  angular.module('talentHuntApp')
    .controller('AdminAccountingOverviewController', ['$window', '$timeout', '$scope', 'ApiService', 'PermissionsService', 'ToastService',
      function ($window, $timeout, $scope, ApiService, PermissionsService, ToastService) {
        var vm = this;
        vm.perms = PermissionsService;
        vm.pageTab = 'overview';
        vm.loading = true;
        vm.overview = null;
        vm.competitions = [];
        vm.selectedCompId = '';

        // Payout modal state
        vm.showPayoutModal = false;
        vm.payoutForm = {
          title: '',
          beneficiary_name: '',
          beneficiary_contact: '',
          payout_type: 'PRIZE',
          beneficiary_type: 'NOMINEE',
          amount_major: null,
          tax_withheld_percent: 5.0,
          payment_method: 'BANK_TRANSFER',
          account_details: '',
          notes: '',
          auto_approve: true
        };

        var trendChartInstance = null;
        var channelChartInstance = null;

        function destroyCharts() {
          if (trendChartInstance) { trendChartInstance.destroy(); trendChartInstance = null; }
          if (channelChartInstance) { channelChartInstance.destroy(); channelChartInstance = null; }
        }

        function renderCharts() {
          if (!vm.overview || !$window.Chart) return;

          // 1. Channel distribution chart
          var channelCanvas = document.getElementById('accountingChannelChart');
          if (channelCanvas) {
            if (channelChartInstance) channelChartInstance.destroy();
            var chs = vm.overview.revenue_by_channel || [];
            var labels = chs.map(function (c) { return c.channel_label; });
            var vals = chs.map(function (c) { return c.amount_ghs; });
            channelChartInstance = new $window.Chart(channelCanvas.getContext('2d'), {
              type: 'doughnut',
              data: {
                labels: labels.length ? labels : ['No data'],
                datasets: [{
                  data: vals.length ? vals : [1],
                  backgroundColor: ['#eab308', '#38bdf8', '#818cf8', '#34d399', '#f472b6'],
                  borderWidth: 0
                }]
              },
              options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: { position: 'bottom', labels: { boxWidth: 11, color: '#d1d5db', font: { size: 11 } } },
                  tooltip: {
                    callbacks: {
                      label: function (ctx) {
                        return ' ' + ctx.label + ': GHS ' + ctx.parsed.toLocaleString();
                      }
                    }
                  }
                },
                cutout: '65%'
              }
            });
          }
        }

        function handleResize() {
          if (channelChartInstance) {
            channelChartInstance.resize();
          }
        }
        angular.element($window).on('resize', handleResize);

        $scope.$on('$destroy', function () {
          angular.element($window).off('resize', handleResize);
          destroyCharts();
        });

        vm.load = function () {
          vm.loading = true;
          var params = {};
          if (vm.selectedCompId) params.competition_id = vm.selectedCompId;

          ApiService.get('/admin/accounting/overview', params).then(function (res) {
            vm.overview = res.data;
            vm.loading = false;
            $timeout(renderCharts, 70);
          }, function (err) {
            vm.loading = false;
            ToastService.error(err.message || 'Failed to load accounting overview.');
          });
        };

        ApiService.get('/admin/competitions').then(function (res) {
          vm.competitions = res.data || [];
        });

        vm.openPayoutModal = function () {
          vm.payoutForm = {
            title: '',
            beneficiary_name: '',
            beneficiary_contact: '',
            payout_type: 'PRIZE',
            beneficiary_type: 'NOMINEE',
            amount_major: null,
            tax_withheld_percent: 5.0,
            payment_method: 'BANK_TRANSFER',
            account_details: '',
            notes: '',
            auto_approve: true
          };
          vm.showPayoutModal = true;
        };

        vm.calcNetPayout = function () {
          var gross = parseFloat(vm.payoutForm.amount_major || 0);
          var taxPct = parseFloat(vm.payoutForm.tax_withheld_percent || 0);
          var tax = gross * (taxPct / 100.0);
          return Math.max(0, gross - tax);
        };

        vm.submitNewPayout = function () {
          if (!vm.payoutForm.title || !vm.payoutForm.beneficiary_name || !vm.payoutForm.amount_major) {
            ToastService.error('Please enter all required payout fields.');
            return;
          }
          var payload = angular.copy(vm.payoutForm);
          if (vm.selectedCompId) payload.competition_id = vm.selectedCompId;

          ApiService.post('/admin/accounting/payouts', payload).then(function () {
            ToastService.success('Financial disbursement record created successfully.');
            vm.showPayoutModal = false;
            vm.load();
          }, function (err) {
            ToastService.error(err.message || 'Failed to create payout record.');
          });
        };

        vm.exportTransactionsCsv = function () {
          $window.open('/api/v1/admin/accounting/transactions?format=csv', '_blank');
        };

        vm.exportPayoutsCsv = function () {
          $window.open('/api/v1/admin/accounting/payouts?format=csv', '_blank');
        };

        vm.load();
      }
    ])
    .controller('AdminAccountingTransactionsController', ['$window', 'ApiService', 'PermissionsService', 'ToastService', 'AdminFilterUtils', 'DataTableSource',
      function ($window, ApiService, PermissionsService, ToastService, AdminFilterUtils, DataTableSource) {
        var vm = this;
        vm.perms = PermissionsService;
        vm.pageTab = 'transactions';
        vm.transactions = [];
        vm.meta = {};
        vm.filters = {
          q: '',
          status: '',
          channel: '',
          provider: '',
          date_from: null,
          date_to: null
        };

        vm.activeFilterCount = function () {
          return AdminFilterUtils.countActive(vm.filters);
        };

        vm.resetFilters = function () {
          vm.filters = { q: '', status: '', channel: '', provider: '', date_from: null, date_to: null };
          vm.load(1);
        };

        vm.table = DataTableSource.server('/admin/accounting/transactions',
          function () { return AdminFilterUtils.cleanParams(vm.filters); },
          function (res) {
            vm.transactions = res.data || [];
            vm.meta = res.meta || {};
          });

        vm.load = function (page) { vm.table.load(page); };

        vm.exportCsv = function () {
          var qs = [];
          var p = AdminFilterUtils.cleanParams(vm.filters);
          for (var k in p) {
            if (p[k]) qs.push(encodeURIComponent(k) + '=' + encodeURIComponent(p[k]));
          }
          qs.push('format=csv');
          $window.open('/api/v1/admin/accounting/transactions?' + qs.join('&'), '_blank');
        };

        vm.reconcileOne = function (t) {
          ApiService.post('/admin/payments/' + t.id + '/reconcile', {}).then(function (res) {
            ToastService.success('Transaction reconciled (' + res.data.outcome + ').');
            vm.load(vm.meta.page);
          }, function (err) {
            ToastService.error(err.message);
          });
        };

        vm.refund = function (t) {
          var reason = $window.prompt('Enter approved refund or chargeback reason for transaction ' + t.provider_reference + ':');
          if (!reason) return;
          ApiService.post('/admin/payments/' + t.id + '/refund', { reason: reason }).then(function () {
            ToastService.success('Transaction refunded and compensating reversal recorded on vote ledger.');
            vm.load(vm.meta.page);
          }, function (err) {
            ToastService.error(err.message);
          });
        };
      }
    ])
    .controller('AdminAccountingPayoutsController', ['$window', 'ApiService', 'PermissionsService', 'ToastService', 'AdminFilterUtils', 'DataTableSource',
      function ($window, ApiService, PermissionsService, ToastService, AdminFilterUtils, DataTableSource) {
        var vm = this;
        vm.perms = PermissionsService;
        vm.pageTab = 'payouts';
        vm.payouts = [];
        vm.meta = {};
        vm.competitions = [];
        vm.filters = {
          q: '',
          status: '',
          payout_type: '',
          competition_id: '',
          date_from: null,
          date_to: null
        };

        // Create Modal
        vm.showCreateModal = false;
        vm.payoutForm = {
          title: '',
          beneficiary_name: '',
          beneficiary_contact: '',
          payout_type: 'PRIZE',
          beneficiary_type: 'NOMINEE',
          amount_major: null,
          tax_withheld_percent: 5.0,
          payment_method: 'BANK_TRANSFER',
          account_details: '',
          notes: '',
          auto_approve: true
        };

        // Disburse Modal
        vm.showDisburseModal = false;
        vm.activePayout = null;
        vm.disburseForm = {
          transaction_reference: ''
        };

        ApiService.get('/admin/competitions').then(function (res) {
          vm.competitions = res.data || [];
        });

        vm.activeFilterCount = function () {
          return AdminFilterUtils.countActive(vm.filters);
        };

        vm.resetFilters = function () {
          vm.filters = { q: '', status: '', payout_type: '', competition_id: '', date_from: null, date_to: null };
          vm.load(1);
        };

        vm.table = DataTableSource.server('/admin/accounting/payouts',
          function () { return AdminFilterUtils.cleanParams(vm.filters); },
          function (res) {
            vm.payouts = res.data || [];
            vm.meta = res.meta || {};
          });

        vm.load = function (page) { vm.table.load(page); };

        vm.calcNetPayout = function () {
          var gross = parseFloat(vm.payoutForm.amount_major || 0);
          var taxPct = parseFloat(vm.payoutForm.tax_withheld_percent || 0);
          var tax = gross * (taxPct / 100.0);
          return Math.max(0, gross - tax);
        };

        vm.openCreateModal = function () {
          vm.payoutForm = {
            title: '',
            beneficiary_name: '',
            beneficiary_contact: '',
            payout_type: 'PRIZE',
            beneficiary_type: 'NOMINEE',
            amount_major: null,
            tax_withheld_percent: 5.0,
            payment_method: 'BANK_TRANSFER',
            account_details: '',
            notes: '',
            auto_approve: true
          };
          vm.showCreateModal = true;
        };

        vm.submitNewPayout = function () {
          if (!vm.payoutForm.title || !vm.payoutForm.beneficiary_name || !vm.payoutForm.amount_major) {
            ToastService.error('Please complete all required fields.');
            return;
          }
          ApiService.post('/admin/accounting/payouts', vm.payoutForm).then(function () {
            ToastService.success('Disbursement scheduled.');
            vm.showCreateModal = false;
            vm.load(1);
          }, function (err) {
            ToastService.error(err.message);
          });
        };

        vm.approve = function (p) {
          ApiService.patch('/admin/accounting/payouts/' + p.id, { status: 'APPROVED' }).then(function () {
            ToastService.success('Payout ' + p.reference_no + ' approved.');
            vm.load(vm.meta.page);
          }, function (err) {
            ToastService.error(err.message);
          });
        };

        vm.openDisburseModal = function (p) {
          vm.activePayout = p;
          vm.disburseForm.transaction_reference = 'BFT-' + Date.now().toString().slice(-6);
          vm.showDisburseModal = true;
        };

        vm.confirmDisburse = function () {
          if (!vm.activePayout) return;
          ApiService.patch('/admin/accounting/payouts/' + vm.activePayout.id, {
            status: 'DISBURSED',
            transaction_reference: vm.disburseForm.transaction_reference
          }).then(function () {
            ToastService.success('Disbursement recorded for ' + vm.activePayout.reference_no + '.');
            vm.showDisburseModal = false;
            vm.activePayout = null;
            vm.load(vm.meta.page);
          }, function (err) {
            ToastService.error(err.message);
          });
        };

        vm.cancelPayout = function (p) {
          if (!$window.confirm('Cancel payout ' + p.reference_no + '?')) return;
          ApiService.patch('/admin/accounting/payouts/' + p.id, { status: 'CANCELLED' }).then(function () {
            ToastService.success('Payout marked as CANCELLED.');
            vm.load(vm.meta.page);
          }, function (err) {
            ToastService.error(err.message);
          });
        };

        vm.deletePayout = function (p) {
          if (!$window.confirm('Permanently delete draft payout ' + p.reference_no + '?')) return;
          ApiService.delete('/admin/accounting/payouts/' + p.id).then(function () {
            ToastService.success('Payout deleted.');
            vm.load(vm.meta.page);
          }, function (err) {
            ToastService.error(err.message);
          });
        };

        vm.exportCsv = function () {
          var qs = [];
          var p = AdminFilterUtils.cleanParams(vm.filters);
          for (var k in p) {
            if (p[k]) qs.push(encodeURIComponent(k) + '=' + encodeURIComponent(p[k]));
          }
          qs.push('format=csv');
          $window.open('/api/v1/admin/accounting/payouts?' + qs.join('&'), '_blank');
        };
      }
    ])
    .run(['$templateCache', function ($templateCache) {
      // 1. Overview Template
      $templateCache.put('admin/accounting-overview.html', [
        '<div class="container portal-layout">',
        '  <th-admin-nav></th-admin-nav>',
        '  <div>',
        '    <div class="flex-between mb-2" style="flex-wrap:wrap;gap:12px;">',
        '      <div>',
        '        <h1 style="margin:0;font-size:1.55rem;display:flex;align-items:center;gap:8px;">',
        '          <th-icon name="credit-card" size="22"></th-icon>',
        '          <span>Accounting &amp; Financial Management Hub</span>',
        '        </h1>',
        '        <p class="muted" style="margin:3px 0 0;font-size:0.86rem;">Official financial records, verified voter collections, gateway settlement fees, and prize disbursement ledger.</p>',
        '      </div>',
        '      <div class="inline-actions">',
        '        <button type="button" class="btn btn-sm btn-secondary" ng-click="vm.exportTransactionsCsv()"><th-icon name="download" size="14"></th-icon><span>Export Transactions (CSV)</span></button>',
        '        <button type="button" class="btn btn-sm btn-primary" ng-click="vm.openPayoutModal()"><th-icon name="plus" size="14"></th-icon><span>Record Payout / Grant</span></button>',
        '        <button type="button" class="btn btn-sm btn-secondary" ng-click="vm.load()"><th-icon name="refresh" size="14"></th-icon><span>Refresh</span></button>',
        '      </div>',
        '    </div>',
        '',
        '    <!-- Unified Accounting Navigation Bar -->',
        '    <div class="accounting-tabs-bar mb-3">',
        '      <div class="inline-actions" style="gap:6px;flex-wrap:wrap;">',
        '        <a href="/admin/accounting" class="btn btn-sm btn-primary"><th-icon name="credit-card" size="14"></th-icon><span>Financial Overview</span></a>',
        '        <a href="/admin/accounting/transactions" class="btn btn-sm btn-secondary"><th-icon name="receipt" size="14"></th-icon><span>Transactions Ledger</span></a>',
        '        <a href="/admin/accounting/payouts" class="btn btn-sm btn-secondary"><th-icon name="trophy" size="14"></th-icon><span>Prize Disbursements</span></a>',
        '        <a href="/admin/reconciliation" class="btn btn-sm btn-secondary"><th-icon name="refresh" size="14"></th-icon><span>Payments &amp; Reconcile</span></a>',
        '        <a href="/admin/orders" class="btn btn-sm btn-secondary"><th-icon name="receipt" size="14"></th-icon><span>Orders</span></a>',
        '        <a href="/admin/votes" class="btn btn-sm btn-secondary"><th-icon name="book-ledger" size="14"></th-icon><span>Vote Ledger</span></a>',
        '        <a href="/admin/reports" class="btn btn-sm btn-secondary"><th-icon name="pie-chart" size="14"></th-icon><span>Reports &amp; CSV</span></a>',
        '      </div>',
        '    </div>',
        '',
        '    <div ng-if="vm.loading" class="loading-box">Loading financial records &amp; ledger balances...</div>',
        '    <div ng-if="vm.overview">',
        '      <!-- Financial Executive KPI Cards -->',
        '      <div class="grid-4 mb-3">',
        '        <div class="kpi-card" style="border-top:3px solid #d97706;">',
        '          <div class="kpi-label">Gross Collections</div>',
        '          <div class="kpi-value">{{ vm.overview.summary.gross_collections_ghs | ghsCurrency:"GHS" }}</div>',
        '          <div class="kpi-sub">{{ vm.overview.summary.successful_payments_count }} successful payments</div>',
        '        </div>',
        '        <div class="kpi-card" style="border-top:3px solid #3b82f6;">',
        '          <div class="kpi-label">Gateway &amp; Processing Fees</div>',
        '          <div class="kpi-value">{{ vm.overview.summary.gateway_fees_ghs | ghsCurrency:"GHS" }}</div>',
        '          <div class="kpi-sub">{{ vm.overview.summary.settlement_success_rate }}% settlement rate</div>',
        '        </div>',
        '        <div class="kpi-card" style="border-top:3px solid #10b981;">',
        '          <div class="kpi-label">Net Collections</div>',
        '          <div class="kpi-value">{{ vm.overview.summary.net_collections_ghs | ghsCurrency:"GHS" }}</div>',
        '          <div class="kpi-sub">Refunds: {{ vm.overview.summary.refunds_ghs | ghsCurrency:"GHS" }}</div>',
        '        </div>',
        '        <div class="kpi-card" style="border-top:3px solid #8b5cf6;">',
        '          <div class="kpi-label">Active Escrow / Reserve</div>',
        '          <div class="kpi-value">{{ vm.overview.summary.escrow_balance_ghs | ghsCurrency:"GHS" }}</div>',
        '          <div class="kpi-sub">Disbursed: {{ vm.overview.summary.payouts_disbursed_ghs | ghsCurrency:"GHS" }}</div>',
        '        </div>',
        '      </div>',
        '',
        '      <!-- PRIZE POOL ALLOCATION & DISBURSEMENT PROGRESS -->',
        '      <div class="card mb-3">',
        '        <div class="flex-between mb-2" style="flex-wrap:wrap;gap:10px;">',
        '          <div>',
        '            <h3 style="margin:0;display:flex;align-items:center;gap:8px;">',
        '              <th-icon name="award" size="18"></th-icon>',
        '              <span>StageLight 2026 Prize Pool Framework &amp; Disbursements</span>',
        '            </h3>',
        '            <p class="muted" style="margin:3px 0 0;font-size:0.86rem;">Charter Section 4.1 Committed Budget: <strong>{{ vm.overview.summary.prize_pool_budget_ghs | ghsCurrency:"GHS" }}</strong> (1st, 2nd, 3rd Cash Prizes + Category Grants + Bursaries).</p>',
        '          </div>',
        '          <div class="inline-actions">',
        '            <a href="/admin/accounting/payouts" class="btn btn-sm btn-secondary"><th-icon name="trophy" size="14"></th-icon><span>Manage Payouts Ledger &rarr;</span></a>',
        '          </div>',
        '        </div>',
        '        <div class="grid-4 mb-3">',
        '          <div class="kpi-mini-card"><div class="kpi-label">Total Prize Budget</div><div class="kpi-value">{{ vm.overview.summary.prize_pool_budget_ghs | ghsCurrency:"GHS" }}</div><div class="kpi-sub">Official Charter committed pool</div></div>',
        '          <div class="kpi-mini-card"><div class="kpi-label">Disbursed to Date</div><div class="kpi-value" style="color:#10b981;">{{ vm.overview.summary.payouts_disbursed_ghs | ghsCurrency:"GHS" }}</div><div class="kpi-sub">Verified bank &amp; MoMo transfers</div></div>',
        '          <div class="kpi-mini-card"><div class="kpi-label">Approved &amp; Scheduled</div><div class="kpi-value" style="color:#f59e0b;">{{ vm.overview.summary.payouts_committed_ghs - vm.overview.summary.payouts_disbursed_ghs | ghsCurrency:"GHS" }}</div><div class="kpi-sub">Cleared for milestone payout</div></div>',
        '          <div class="kpi-mini-card"><div class="kpi-label">Pending Approval</div><div class="kpi-value" style="color:#8b5cf6;">{{ vm.overview.summary.payouts_pending_ghs | ghsCurrency:"GHS" }}</div><div class="kpi-sub">Awaiting finance officer sign-off</div></div>',
        '        </div>',
        '        <div class="table-responsive">',
        '          <table class="data-table" style="font-size:0.88rem;">',
        '            <thead><tr><th>Prize Tier / Framework Designation</th><th>Governing Allocation</th><th>Commitment Status</th><th>Disbursement Terms &amp; Conditions</th></tr></thead>',
        '            <tbody>',
        '              <tr ng-repeat="pf in vm.overview.prize_framework">',
        '                <td><strong>{{ pf.tier }}</strong></td>',
        '                <td><span style="font-family:monospace;font-weight:700;">{{ pf.allocation_ghs | ghsCurrency:"GHS" }}</span></td>',
        '                <td><span class="badge badge-success">{{ pf.status }}</span></td>',
        '                <td class="muted">{{ pf.terms }}</td>',
        '              </tr>',
        '            </tbody>',
        '          </table>',
        '        </div>',
        '      </div>',
        '',
        '      <!-- Two-Column Breakdown: Channels & Categories -->',
        '      <div class="grid-2 mb-3">',
        '        <div class="card">',
        '          <div class="flex-between mb-2">',
        '            <h3 style="margin:0;font-size:1.05rem;"><th-icon name="credit-card" size="16"></th-icon><span> Collections by Payment Channel</span></h3>',
        '            <a href="/admin/reconciliation" class="btn btn-sm btn-secondary">Reconcile Gateways</a>',
        '          </div>',
        '          <div style="height:190px;position:relative;margin-bottom:12px;">',
        '            <canvas id="accountingChannelChart"></canvas>',
        '          </div>',
        '          <div class="table-responsive">',
        '            <table class="data-table" style="font-size:0.84rem;">',
        '              <thead><tr><th>Channel</th><th>Transactions</th><th>Gross Total</th><th>Volume Share</th></tr></thead>',
        '              <tbody>',
        '                <tr ng-repeat="ch in vm.overview.revenue_by_channel">',
        '                  <td><strong>{{ ch.channel_label }}</strong></td>',
        '                  <td>{{ ch.count }}</td>',
        '                  <td>{{ ch.amount_ghs | ghsCurrency:"GHS" }}</td>',
        '                  <td><div style="display:flex;align-items:center;gap:6px;"><div style="background:var(--border);height:6px;width:60px;border-radius:3px;overflow:hidden;"><div style="background:var(--accent);height:100%;width:{{ ch.percentage }}%;"></div></div><span>{{ ch.percentage }}%</span></div></td>',
        '                </tr>',
        '              </tbody>',
        '            </table>',
        '          </div>',
        '        </div>',
        '',
        '        <div class="card">',
        '          <div class="flex-between mb-2">',
        '            <h3 style="margin:0;font-size:1.05rem;"><th-icon name="layers" size="16"></th-icon><span> Category Financial Performance</span></h3>',
        '            <a href="/admin/votes" class="btn btn-sm btn-secondary">Vote Ledger</a>',
        '          </div>',
        '          <p class="muted" style="margin:0 0 12px;font-size:0.84rem;">Audited public voting collections aggregated across talent performance tracks.</p>',
        '          <div class="table-responsive">',
        '            <table class="data-table" style="font-size:0.84rem;">',
        '              <thead><tr><th>Category</th><th>Verified Votes</th><th>Collections (GHS)</th><th>Revenue Share</th></tr></thead>',
        '              <tbody>',
        '                <tr ng-repeat="cp in vm.overview.category_performance">',
        '                  <td><strong>{{ cp.category_name }}</strong></td>',
        '                  <td>{{ cp.votes | number }}</td>',
        '                  <td>{{ cp.revenue_ghs | ghsCurrency:"GHS" }}</td>',
        '                  <td><div style="display:flex;align-items:center;gap:6px;"><div style="background:var(--border);height:6px;width:60px;border-radius:3px;overflow:hidden;"><div style="background:#10b981;height:100%;width:{{ cp.share_percentage }}%;"></div></div><span>{{ cp.share_percentage }}%</span></div></td>',
        '                </tr>',
        '              </tbody>',
        '            </table>',
        '          </div>',
        '        </div>',
        '      </div>',
        '',
        '      <!-- Recent Financial Transactions Strip -->',
        '      <div class="card mb-3">',
        '        <div class="flex-between mb-2">',
        '          <div>',
        '            <h3 style="margin:0;font-size:1.05rem;"><th-icon name="receipt" size="16"></th-icon><span> Recent Financial Transactions</span></h3>',
        '            <p class="muted" style="margin:2px 0 0;font-size:0.84rem;">Latest voter purchases, charges, and settlement webhooks.</p>',
        '          </div>',
        '          <a href="/admin/accounting/transactions" class="btn btn-sm btn-primary">View Full Transactions Ledger &rarr;</a>',
        '        </div>',
        '        <div class="table-responsive">',
        '          <table class="data-table" style="font-size:0.84rem;">',
        '            <thead><tr><th>Timestamp</th><th>Reference / Receipt</th><th>Customer</th><th>Channel</th><th>Nominee</th><th>Gross</th><th>Net</th><th>Status</th></tr></thead>',
        '            <tbody>',
        '              <tr ng-repeat="tx in vm.overview.recent_transactions">',
        '                <td>{{ tx.created_at | date:"short" }}</td>',
        '                <td><code>{{ tx.provider_reference }}</code><br><small class="muted">{{ tx.order_reference }}</small></td>',
        '                <td>{{ tx.voter_name || "Voter" }}</td>',
        '                <td><span class="badge">{{ tx.channel }}</span></td>',
        '                <td>{{ tx.nominee_name || "—" }}</td>',
        '                <td><strong>{{ tx.gross_amount_major | ghsCurrency:"GHS" }}</strong></td>',
        '                <td>{{ tx.net_amount_major | ghsCurrency:"GHS" }}</td>',
        '                <td><span class="badge" ng-class="{\'badge-success\': tx.status === \'SUCCESS\', \'badge-warning\': tx.status === \'PENDING\', \'badge-danger\': tx.status === \'REFUNDED\' || tx.status === \'FAILED\'}">{{ tx.status }}</span></td>',
        '              </tr>',
        '            </tbody>',
        '          </table>',
        '        </div>',
        '      </div>',
        '',
        '      <!-- Recent Disbursements Strip -->',
        '      <div class="card">',
        '        <div class="flex-between mb-2">',
        '          <div>',
        '            <h3 style="margin:0;font-size:1.05rem;"><th-icon name="trophy" size="16"></th-icon><span> Recent Prize Disbursements &amp; Grants</span></h3>',
        '            <p class="muted" style="margin:2px 0 0;font-size:0.84rem;">Official prize payouts, category awards, and production disbursements.</p>',
        '          </div>',
        '          <a href="/admin/accounting/payouts" class="btn btn-sm btn-secondary">View All Payouts &rarr;</a>',
        '        </div>',
        '        <div class="table-responsive">',
        '          <table class="data-table" style="font-size:0.84rem;">',
        '            <thead><tr><th>Reference</th><th>Title &amp; Designation</th><th>Beneficiary</th><th>Type</th><th>Amount (GHS)</th><th>Net Disbursed</th><th>Status</th></tr></thead>',
        '            <tbody>',
        '              <tr ng-repeat="po in vm.overview.recent_payouts">',
        '                <td><code>{{ po.reference_no }}</code></td>',
        '                <td><strong>{{ po.title }}</strong></td>',
        '                <td>{{ po.beneficiary_name }}</td>',
        '                <td><span class="badge">{{ po.payout_type }}</span></td>',
        '                <td>{{ po.amount_major | ghsCurrency:"GHS" }}</td>',
        '                <td><strong>{{ po.net_amount_major | ghsCurrency:"GHS" }}</strong></td>',
        '                <td><span class="badge" ng-class="{\'badge-success\': po.status === \'DISBURSED\', \'badge-warning\': po.status === \'APPROVED\' || po.status === \'PENDING_APPROVAL\', \'badge-danger\': po.status === \'CANCELLED\'}">{{ po.status }}</span></td>',
        '              </tr>',
        '            </tbody>',
        '          </table>',
        '        </div>',
        '      </div>',
        '    </div>',
        '',
        '    <!-- Record Payout Modal -->',
        '    <div class="modal-backdrop" ng-if="vm.showPayoutModal" ng-click="vm.showPayoutModal=false"></div>',
        '    <div class="modal-dialog" ng-if="vm.showPayoutModal">',
        '      <div class="modal-header">',
        '        <h3 style="margin:0;"><th-icon name="plus" size="18"></th-icon> Record / Schedule Payout</h3>',
        '        <button type="button" class="btn-close" ng-click="vm.showPayoutModal=false">&times;</button>',
        '      </div>',
        '      <form ng-submit="vm.submitNewPayout()">',
        '        <div class="modal-body">',
        '          <div class="form-group mb-2">',
        '            <label class="form-label">Payout Title *</label>',
        '            <input type="text" class="form-control" ng-model="vm.payoutForm.title" placeholder="e.g. 1st Place Champion Cash Prize — Milestone 1" required />',
        '          </div>',
        '          <div class="grid-2 mb-2">',
        '            <div class="form-group">',
        '              <label class="form-label">Payout Type *</label>',
        '              <select class="form-control" ng-model="vm.payoutForm.payout_type" required>',
        '                <option value="PRIZE">PRIZE (Cash Prize)</option>',
        '                <option value="GRANT">GRANT (Category Excellence)</option>',
        '                <option value="STIPEND">STIPEND (Performer Subsidy)</option>',
        '                <option value="PRODUCTION">PRODUCTION (Vendor/Showcase)</option>',
        '                <option value="OTHER">OTHER</option>',
        '              </select>',
        '            </div>',
        '            <div class="form-group">',
        '              <label class="form-label">Beneficiary Type *</label>',
        '              <select class="form-control" ng-model="vm.payoutForm.beneficiary_type" required>',
        '                <option value="NOMINEE">NOMINEE (Finalist/Performer)</option>',
        '                <option value="CONTESTANT">CONTESTANT</option>',
        '                <option value="VENDOR">VENDOR</option>',
        '                <option value="STAFF">STAFF</option>',
        '              </select>',
        '            </div>',
        '          </div>',
        '          <div class="grid-2 mb-2">',
        '            <div class="form-group">',
        '              <label class="form-label">Beneficiary Full Legal Name *</label>',
        '              <input type="text" class="form-control" ng-model="vm.payoutForm.beneficiary_name" placeholder="Matching Ghana Card / Passport" required />',
        '            </div>',
        '            <div class="form-group">',
        '              <label class="form-label">Beneficiary Phone / Contact</label>',
        '              <input type="text" class="form-control" ng-model="vm.payoutForm.beneficiary_contact" placeholder="+233..." />',
        '            </div>',
        '          </div>',
        '          <div class="grid-3 mb-2">',
        '            <div class="form-group">',
        '              <label class="form-label">Gross Amount (GHS) *</label>',
        '              <input type="number" step="0.01" min="1" class="form-control" ng-model="vm.payoutForm.amount_major" placeholder="50000.00" required />',
        '            </div>',
        '            <div class="form-group">',
        '              <label class="form-label">GRA Withholding (%)</label>',
        '              <select class="form-control" ng-model="vm.payoutForm.tax_withheld_percent">',
        '                <option ng-value="0">0% (Exempt)</option>',
        '                <option ng-value="5.0">5.0% (Standard Withholding)</option>',
        '                <option ng-value="7.5">7.5% (Services / Production)</option>',
        '                <option ng-value="15.0">15.0% (Non-Resident / Special)</option>',
        '              </select>',
        '            </div>',
        '            <div class="form-group">',
        '              <label class="form-label">Estimated Net Payout</label>',
        '              <div class="form-control" style="background:var(--bg-surface-2);font-weight:700;color:#10b981;">{{ vm.calcNetPayout() | ghsCurrency:"GHS" }}</div>',
        '            </div>',
        '          </div>',
        '          <div class="grid-2 mb-2">',
        '            <div class="form-group">',
        '              <label class="form-label">Payment Method *</label>',
        '              <select class="form-control" ng-model="vm.payoutForm.payment_method" required>',
        '                <option value="BANK_TRANSFER">Bank Wire / ACH</option>',
        '                <option value="MOBILE_MONEY">Mobile Money (MTN / Telecel / AT)</option>',
        '                <option value="ESCROW">Escrow Account (Minors)</option>',
        '                <option value="CHEQUE">Cheque</option>',
        '              </select>',
        '            </div>',
        '            <div class="form-group">',
        '              <label class="form-label">Bank / MoMo Account Details</label>',
        '              <input type="text" class="form-control" ng-model="vm.payoutForm.account_details" placeholder="Bank name, branch &amp; ACC / MoMo number" />',
        '            </div>',
        '          </div>',
        '          <div class="form-group mb-2">',
        '            <label class="form-label">Internal Audit &amp; Governance Notes</label>',
        '            <textarea class="form-control" rows="2" ng-model="vm.payoutForm.notes" placeholder="Approval reference, milestone conditions, Ghana Card ID..."></textarea>',
        '          </div>',
        '          <div class="form-group">',
        '            <label style="display:flex;align-items:center;gap:8px;font-size:0.85rem;cursor:pointer;">',
        '              <input type="checkbox" ng-model="vm.payoutForm.auto_approve" />',
        '              <span>Auto-approve disbursement (finance officer pre-clearance)</span>',
        '            </label>',
        '          </div>',
        '        </div>',
        '        <div class="modal-footer">',
        '          <button type="button" class="btn btn-secondary" ng-click="vm.showPayoutModal=false">Cancel</button>',
        '          <button type="submit" class="btn btn-primary">Record Payout</button>',
        '        </div>',
        '      </form>',
        '    </div>',
        '  </div>',
        '</div>'
      ].join(''));

      // 2. Transactions Ledger Template
      $templateCache.put('admin/accounting-transactions.html', [
        '<div class="container portal-layout">',
        '  <th-admin-nav></th-admin-nav>',
        '  <div>',
        '    <div class="flex-between mb-2" style="flex-wrap:wrap;gap:12px;">',
        '      <div>',
        '        <h1 style="margin:0;font-size:1.55rem;display:flex;align-items:center;gap:8px;">',
        '          <th-icon name="receipt" size="22"></th-icon>',
        '          <span>Unified Financial Transactions Ledger</span>',
        '        </h1>',
        '        <p class="muted" style="margin:3px 0 0;font-size:0.86rem;">Comprehensive ledger tracking voter vote charges, payment provider references, fee deductions, and refunds.</p>',
        '      </div>',
        '      <div class="inline-actions">',
        '        <button type="button" class="btn btn-sm btn-secondary" ng-click="vm.exportCsv()"><th-icon name="download" size="14"></th-icon><span>Export Filtered CSV</span></button>',
        '        <a href="/admin/reconciliation" class="btn btn-sm btn-secondary"><th-icon name="credit-card" size="14"></th-icon><span>Reconciliation Center</span></a>',
        '        <button type="button" class="btn btn-sm btn-secondary" ng-click="vm.load(1)"><th-icon name="refresh" size="14"></th-icon><span>Refresh</span></button>',
        '      </div>',
        '    </div>',
        '',
        '    <!-- Unified Accounting Navigation Bar -->',
        '    <div class="accounting-tabs-bar mb-3">',
        '      <div class="inline-actions" style="gap:6px;flex-wrap:wrap;">',
        '        <a href="/admin/accounting" class="btn btn-sm btn-secondary"><th-icon name="credit-card" size="14"></th-icon><span>Financial Overview</span></a>',
        '        <a href="/admin/accounting/transactions" class="btn btn-sm btn-primary"><th-icon name="receipt" size="14"></th-icon><span>Transactions Ledger</span></a>',
        '        <a href="/admin/accounting/payouts" class="btn btn-sm btn-secondary"><th-icon name="trophy" size="14"></th-icon><span>Prize Disbursements</span></a>',
        '        <a href="/admin/reconciliation" class="btn btn-sm btn-secondary"><th-icon name="refresh" size="14"></th-icon><span>Payments &amp; Reconcile</span></a>',
        '        <a href="/admin/orders" class="btn btn-sm btn-secondary"><th-icon name="receipt" size="14"></th-icon><span>Orders</span></a>',
        '        <a href="/admin/votes" class="btn btn-sm btn-secondary"><th-icon name="book-ledger" size="14"></th-icon><span>Vote Ledger</span></a>',
        '        <a href="/admin/reports" class="btn btn-sm btn-secondary"><th-icon name="pie-chart" size="14"></th-icon><span>Reports &amp; CSV</span></a>',
        '      </div>',
        '    </div>',
        '',
        '    <!-- Filter Bar -->',
        '    <div class="filter-bar mb-3">',
        '      <div class="filter-bar-top">',
        '        <span class="filter-bar-title"><th-icon name="filter" size="14"></th-icon><span>Transaction Filters</span></span>',
        '        <div class="inline-actions">',
        '          <span class="filter-count-pill" ng-class="{\'filter-active-badge\': vm.activeFilterCount() > 0}" ng-if="vm.activeFilterCount() > 0">{{ vm.activeFilterCount() }} active</span>',
        '          <button type="button" class="btn btn-sm btn-secondary" ng-if="vm.activeFilterCount() > 0" ng-click="vm.resetFilters()"><th-icon name="rotate-ccw" size="14"></th-icon><span>Reset</span></button>',
        '        </div>',
        '      </div>',
        '      <div class="filter-bar-grid">',
        '        <div class="filter-field-search">',
        '          <label class="filter-label">Search Transactions</label>',
        '          <div class="search-input-wrap">',
        '            <th-icon name="search" size="15"></th-icon>',
        '            <input type="text" class="form-control form-control-sm" ng-model="vm.filters.q" ng-model-options="{ debounce: 250 }" ng-change="vm.load(1)" placeholder="Order ref, receipt code, phone, nominee..." />',
        '          </div>',
        '        </div>',
        '        <div class="filter-field">',
        '          <label class="filter-label">Payment Status</label>',
        '          <select class="form-control form-control-sm" ng-model="vm.filters.status" ng-change="vm.load(1)">',
        '            <option value="">All Statuses</option>',
        '            <option value="SUCCESS">SUCCESS (Paid &amp; Credited)</option>',
        '            <option value="PENDING">PENDING (Awaiting Webhook)</option>',
        '            <option value="REFUNDED">REFUNDED (Reversed)</option>',
        '            <option value="QUARANTINED">QUARANTINED (Disputed)</option>',
        '            <option value="FAILED">FAILED</option>',
        '          </select>',
        '        </div>',
        '        <div class="filter-field">',
        '          <label class="filter-label">Payment Channel</label>',
        '          <select class="form-control form-control-sm" ng-model="vm.filters.channel" ng-change="vm.load(1)">',
        '            <option value="">All Channels</option>',
        '            <option value="mobile_money">Mobile Money (MoMo)</option>',
        '            <option value="card">Card (Visa/Mastercard)</option>',
        '            <option value="bank_transfer">Direct Bank</option>',
        '            <option value="fintech">Fintech / GhanaPay</option>',
        '          </select>',
        '        </div>',
        '        <div class="filter-field">',
        '          <label class="filter-label">Date From</label>',
        '          <input type="date" class="form-control form-control-sm" ng-model="vm.filters.date_from" ng-change="vm.load(1)" />',
        '        </div>',
        '        <div class="filter-field">',
        '          <label class="filter-label">Date To</label>',
        '          <input type="date" class="form-control form-control-sm" ng-model="vm.filters.date_to" ng-change="vm.load(1)" />',
        '        </div>',
        '      </div>',
        '    </div>',
        '',
        '    <!-- Matching Volume Summary Strip -->',
        '    <div class="grid-4 mb-3" ng-if="vm.meta.summary">',
        '      <div class="kpi-mini-card"><div class="kpi-label">Filtered Transactions</div><div class="kpi-value">{{ vm.meta.summary.matching_count }}</div><div class="kpi-sub">Total matching criteria</div></div>',
        '      <div class="kpi-mini-card"><div class="kpi-label">Gross Volume</div><div class="kpi-value">{{ vm.meta.summary.gross_volume_ghs | ghsCurrency:"GHS" }}</div><div class="kpi-sub">Total payments received</div></div>',
        '      <div class="kpi-mini-card"><div class="kpi-label">Gateway Fees</div><div class="kpi-value" style="color:#ef4444;">{{ vm.meta.summary.fees_ghs | ghsCurrency:"GHS" }}</div><div class="kpi-sub">Deducted processing fees</div></div>',
        '      <div class="kpi-mini-card"><div class="kpi-label">Net Settlement Volume</div><div class="kpi-value" style="color:#10b981;">{{ vm.meta.summary.net_volume_ghs | ghsCurrency:"GHS" }}</div><div class="kpi-sub">After fees &amp; refunds</div></div>',
        '    </div>',
        '',
        '    <!-- Transactions Table -->',
        '    <div class="card">',
        '      <div class="table-responsive">',
        '        <table class="data-table" th-datatable dt-data="vm.transactions" dt-row="t" dt-page-length="25" dt-empty="No financial transactions match the selected filters.">',
        '          <thead>',
        '            <tr>',
        '              <th dt-sort="t.created_at">Timestamp</th>',
        '              <th dt-sort="t.provider_reference">Reference / Order</th>',
        '              <th>Payer / Contact</th>',
        '              <th>Channel / Gateway</th>',
        '              <th>Nominee / Round</th>',
        '              <th dt-sort="t.amount">Gross (GHS)</th>',
        '              <th>Fee</th>',
        '              <th>Net (GHS)</th>',
        '              <th dt-sort="t.status">Status</th>',
        '              <th>Actions</th>',
        '            </tr>',
        '          </thead>',
        '          <tbody>',
        '            <tr>',
        '              <td>{{ t.created_at | date:"short" }}</td>',
        '              <td>',
        '                <code>{{ t.provider_reference }}</code>',
        '                <div ng-if="t.order_reference"><small class="muted">Ord: {{ t.order_reference }}</small></div>',
        '                <div ng-if="t.receipt_code"><small class="muted" style="color:var(--accent);">Rcpt: {{ t.receipt_code }}</small></div>',
        '              </td>',
        '              <td>',
        '                <div>{{ t.voter_name || "Voter" }}</div>',
        '                <small class="muted">{{ t.voter_phone }}</small>',
        '              </td>',
        '              <td>',
        '                <span class="badge">{{ t.channel }}</span>',
        '                <div><small class="muted">{{ t.provider }}</small></div>',
        '              </td>',
        '              <td>',
        '                <strong>{{ t.nominee_name || "—" }}</strong>',
        '                <div ng-if="t.vote_quantity"><small class="muted">{{ t.vote_quantity }} votes</small></div>',
        '              </td>',
        '              <td><strong>{{ t.gross_amount_major | ghsCurrency:"GHS" }}</strong></td>',
        '              <td class="muted">{{ t.fee_major | ghsCurrency:"GHS" }}</td>',
        '              <td style="color:#10b981;font-weight:700;">{{ t.net_amount_major | ghsCurrency:"GHS" }}</td>',
        '              <td>',
        '                <span class="badge" ng-class="{\'badge-success\': t.status === \'SUCCESS\', \'badge-warning\': t.status === \'PENDING\', \'badge-danger\': t.status === \'REFUNDED\' || t.status === \'FAILED\', \'badge-quarantine\': t.status === \'QUARANTINED\'}">{{ t.status }}</span>',
        '              </td>',
        '              <td>',
        '                <div class="inline-actions" style="gap:4px;">',
        '                  <button type="button" class="btn btn-xs btn-secondary" ng-if="t.status === \'PENDING\'" ng-click="vm.reconcileOne(t)" title="Reconcile with gateway">Reconcile</button>',
        '                  <button type="button" class="btn btn-xs btn-danger" ng-if="t.status === \'SUCCESS\' && vm.perms.canFinance()" ng-click="vm.refund(t)" title="Issue audited refund">Refund</button>',
        '                </div>',
        '              </td>',
        '            </tr>',
        '          </tbody>',
        '        </table>',
        '      </div>',
        '    </div>',
        '  </div>',
        '</div>'
      ].join(''));

      // 3. Payouts & Disbursements Template
      $templateCache.put('admin/accounting-payouts.html', [
        '<div class="container portal-layout">',
        '  <th-admin-nav></th-admin-nav>',
        '  <div>',
        '    <div class="flex-between mb-2" style="flex-wrap:wrap;gap:12px;">',
        '      <div>',
        '        <h1 style="margin:0;font-size:1.55rem;display:flex;align-items:center;gap:8px;">',
        '          <th-icon name="trophy" size="22"></th-icon>',
        '          <span>Prize Disbursements, Grants &amp; Payouts Ledger</span>',
        '        </h1>',
        '        <p class="muted" style="margin:3px 0 0;font-size:0.86rem;">Track official cash awards (GHS 100k, 40k, 20k), performer category grants, judge honorariums, and production disbursements.</p>',
        '      </div>',
        '      <div class="inline-actions">',
        '        <button type="button" class="btn btn-sm btn-secondary" ng-click="vm.exportCsv()"><th-icon name="download" size="14"></th-icon><span>Export Payouts (CSV)</span></button>',
        '        <button type="button" class="btn btn-sm btn-primary" ng-click="vm.openCreateModal()"><th-icon name="plus" size="14"></th-icon><span>Schedule New Payout</span></button>',
        '        <button type="button" class="btn btn-sm btn-secondary" ng-click="vm.load(1)"><th-icon name="refresh" size="14"></th-icon><span>Refresh</span></button>',
        '      </div>',
        '    </div>',
        '',
        '    <!-- Unified Accounting Navigation Bar -->',
        '    <div class="accounting-tabs-bar mb-3">',
        '      <div class="inline-actions" style="gap:6px;flex-wrap:wrap;">',
        '        <a href="/admin/accounting" class="btn btn-sm btn-secondary"><th-icon name="credit-card" size="14"></th-icon><span>Financial Overview</span></a>',
        '        <a href="/admin/accounting/transactions" class="btn btn-sm btn-secondary"><th-icon name="receipt" size="14"></th-icon><span>Transactions Ledger</span></a>',
        '        <a href="/admin/accounting/payouts" class="btn btn-sm btn-primary"><th-icon name="trophy" size="14"></th-icon><span>Prize Disbursements</span></a>',
        '        <a href="/admin/reconciliation" class="btn btn-sm btn-secondary"><th-icon name="refresh" size="14"></th-icon><span>Payments &amp; Reconcile</span></a>',
        '        <a href="/admin/orders" class="btn btn-sm btn-secondary"><th-icon name="receipt" size="14"></th-icon><span>Orders</span></a>',
        '        <a href="/admin/votes" class="btn btn-sm btn-secondary"><th-icon name="book-ledger" size="14"></th-icon><span>Vote Ledger</span></a>',
        '        <a href="/admin/reports" class="btn btn-sm btn-secondary"><th-icon name="pie-chart" size="14"></th-icon><span>Reports &amp; CSV</span></a>',
        '      </div>',
        '    </div>',
        '',
        '    <!-- Summary KPI Cards -->',
        '    <div class="grid-4 mb-3" ng-if="vm.meta.summary">',
        '      <div class="kpi-mini-card"><div class="kpi-label">Total Disbursed</div><div class="kpi-value" style="color:#10b981;">{{ vm.meta.summary.total_disbursed_ghs | ghsCurrency:"GHS" }}</div><div class="kpi-sub">Completed disbursements</div></div>',
        '      <div class="kpi-mini-card"><div class="kpi-label">Approved &amp; Scheduled</div><div class="kpi-value" style="color:#f59e0b;">{{ vm.meta.summary.approved_scheduled_ghs | ghsCurrency:"GHS" }}</div><div class="kpi-sub">Awaiting release date</div></div>',
        '      <div class="kpi-mini-card"><div class="kpi-label">Pending Approval</div><div class="kpi-value" style="color:#8b5cf6;">{{ vm.meta.summary.pending_approval_ghs | ghsCurrency:"GHS" }}</div><div class="kpi-sub">Awaiting finance review</div></div>',
        '      <div class="kpi-mini-card"><div class="kpi-label">GRA Withholding Tax</div><div class="kpi-value">{{ vm.meta.summary.total_tax_withheld_ghs | ghsCurrency:"GHS" }}</div><div class="kpi-sub">Statutory tax deductions</div></div>',
        '    </div>',
        '',
        '    <!-- Filter Bar -->',
        '    <div class="filter-bar mb-3">',
        '      <div class="filter-bar-top">',
        '        <span class="filter-bar-title"><th-icon name="filter" size="14"></th-icon><span>Disbursement Filters</span></span>',
        '        <div class="inline-actions">',
        '          <span class="filter-count-pill" ng-class="{\'filter-active-badge\': vm.activeFilterCount() > 0}" ng-if="vm.activeFilterCount() > 0">{{ vm.activeFilterCount() }} active</span>',
        '          <button type="button" class="btn btn-sm btn-secondary" ng-if="vm.activeFilterCount() > 0" ng-click="vm.resetFilters()"><th-icon name="rotate-ccw" size="14"></th-icon><span>Reset</span></button>',
        '        </div>',
        '      </div>',
        '      <div class="filter-bar-grid">',
        '        <div class="filter-field-search">',
        '          <label class="filter-label">Search Disbursements</label>',
        '          <div class="search-input-wrap">',
        '            <th-icon name="search" size="15"></th-icon>',
        '            <input type="text" class="form-control form-control-sm" ng-model="vm.filters.q" ng-model-options="{ debounce: 250 }" ng-change="vm.load(1)" placeholder="Reference, beneficiary name, account details..." />',
        '          </div>',
        '        </div>',
        '        <div class="filter-field">',
        '          <label class="filter-label">Status</label>',
        '          <select class="form-control form-control-sm" ng-model="vm.filters.status" ng-change="vm.load(1)">',
        '            <option value="">All Statuses</option>',
        '            <option value="PENDING_APPROVAL">Pending Approval</option>',
        '            <option value="APPROVED">Approved / Scheduled</option>',
        '            <option value="DISBURSED">Disbursed (Settled)</option>',
        '            <option value="CANCELLED">Cancelled</option>',
        '          </select>',
        '        </div>',
        '        <div class="filter-field">',
        '          <label class="filter-label">Payout Type</label>',
        '          <select class="form-control form-control-sm" ng-model="vm.filters.payout_type" ng-change="vm.load(1)">',
        '            <option value="">All Types</option>',
        '            <option value="PRIZE">PRIZE (Podium Cash)</option>',
        '            <option value="GRANT">GRANT (Excellence Award)</option>',
        '            <option value="STIPEND">STIPEND (Performer Subsidy)</option>',
        '            <option value="PRODUCTION">PRODUCTION (Vendor)</option>',
        '          </select>',
        '        </div>',
        '        <div class="filter-field">',
        '          <label class="filter-label">Date From</label>',
        '          <input type="date" class="form-control form-control-sm" ng-model="vm.filters.date_from" ng-change="vm.load(1)" />',
        '        </div>',
        '      </div>',
        '    </div>',
        '',
        '    <!-- Payouts Table -->',
        '    <div class="card">',
        '      <div class="table-responsive">',
        '        <table class="data-table" th-datatable dt-data="vm.payouts" dt-row="p" dt-page-length="20" dt-empty="No disbursement records match the selected filters.">',
        '          <thead>',
        '            <tr>',
        '              <th dt-sort="p.created_at">Ref &amp; Date</th>',
        '              <th>Title &amp; Award Designation</th>',
        '              <th dt-sort="p.beneficiary_name">Beneficiary</th>',
        '              <th>Method &amp; Account</th>',
        '              <th dt-sort="p.amount">Gross (GHS)</th>',
        '              <th>GRA Tax</th>',
        '              <th>Net (GHS)</th>',
        '              <th dt-sort="p.status">Status</th>',
        '              <th>Actions</th>',
        '            </tr>',
        '          </thead>',
        '          <tbody>',
        '            <tr>',
        '              <td>',
        '                <code>{{ p.reference_no }}</code>',
        '                <div><small class="muted">{{ p.created_at | date:"shortDate" }}</small></div>',
        '              </td>',
        '              <td>',
        '                <strong>{{ p.title }}</strong>',
        '                <div><span class="badge">{{ p.payout_type }}</span> <small class="muted" ng-if="p.competition_title">{{ p.competition_title }}</small></div>',
        '                <div ng-if="p.notes"><small class="muted" style="font-style:italic;">{{ p.notes }}</small></div>',
        '              </td>',
        '              <td>',
        '                <strong>{{ p.beneficiary_name }}</strong>',
        '                <div ng-if="p.beneficiary_contact"><small class="muted">{{ p.beneficiary_contact }}</small></div>',
        '                <div><small class="badge" style="font-size:0.7rem;">{{ p.beneficiary_type }}</small></div>',
        '              </td>',
        '              <td>',
        '                <div>{{ p.payment_method }}</div>',
        '                <small class="muted" style="word-break:break-all;">{{ p.account_details || "—" }}</small>',
        '                <div ng-if="p.transaction_reference"><small style="color:var(--accent);font-family:monospace;">Tx: {{ p.transaction_reference }}</small></div>',
        '              </td>',
        '              <td><strong>{{ p.amount_major | ghsCurrency:"GHS" }}</strong></td>',
        '              <td class="muted">{{ p.tax_withheld_major | ghsCurrency:"GHS" }}</td>',
        '              <td style="color:#10b981;font-weight:700;">{{ p.net_amount_major | ghsCurrency:"GHS" }}</td>',
        '              <td>',
        '                <span class="badge" ng-class="{\'badge-success\': p.status === \'DISBURSED\', \'badge-warning\': p.status === \'APPROVED\' || p.status === \'PENDING_APPROVAL\', \'badge-danger\': p.status === \'CANCELLED\'}">{{ p.status }}</span>',
        '                <div ng-if="p.approved_by_name"><small class="muted">By: {{ p.approved_by_name }}</small></div>',
        '              </td>',
        '              <td>',
        '                <div class="inline-actions" style="gap:4px;">',
        '                  <button type="button" class="btn btn-xs btn-primary" ng-if="p.status === \'PENDING_APPROVAL\'" ng-click="vm.approve(p)" title="Approve disbursement">Approve</button>',
        '                  <button type="button" class="btn btn-xs btn-success" ng-if="p.status === \'APPROVED\'" ng-click="vm.openDisburseModal(p)" title="Mark as disbursed with transfer reference">Disburse</button>',
        '                  <button type="button" class="btn btn-xs btn-secondary" ng-if="p.status !== \'DISBURSED\' && p.status !== \'CANCELLED\'" ng-click="vm.cancelPayout(p)" title="Cancel payout">Cancel</button>',
        '                  <button type="button" class="btn btn-xs btn-danger" ng-if="p.status === \'PENDING_APPROVAL\' || p.status === \'CANCELLED\'" ng-click="vm.deletePayout(p)" title="Delete record"><th-icon name="trash" size="12"></th-icon></button>',
        '                </div>',
        '              </td>',
        '            </tr>',
        '          </tbody>',
        '        </table>',
        '      </div>',
        '    </div>',
        '',
        '    <!-- Schedule Payout Modal -->',
        '    <div class="modal-backdrop" ng-if="vm.showCreateModal" ng-click="vm.showCreateModal=false"></div>',
        '    <div class="modal-dialog" ng-if="vm.showCreateModal">',
        '      <div class="modal-header">',
        '        <h3 style="margin:0;"><th-icon name="trophy" size="18"></th-icon> Schedule New Payout / Grant</h3>',
        '        <button type="button" class="btn-close" ng-click="vm.showCreateModal=false">&times;</button>',
        '      </div>',
        '      <form ng-submit="vm.submitNewPayout()">',
        '        <div class="modal-body">',
        '          <div class="form-group mb-2">',
        '            <label class="form-label">Title / Award Designation *</label>',
        '            <input type="text" class="form-control" ng-model="vm.payoutForm.title" placeholder="e.g. 1st Place Champion Cash Prize — Milestone 1" required />',
        '          </div>',
        '          <div class="grid-2 mb-2">',
        '            <div class="form-group">',
        '              <label class="form-label">Payout Type *</label>',
        '              <select class="form-control" ng-model="vm.payoutForm.payout_type" required>',
        '                <option value="PRIZE">PRIZE (Podium Cash Prize)</option>',
        '                <option value="GRANT">GRANT (Category Excellence)</option>',
        '                <option value="STIPEND">STIPEND (Performer Subsidy)</option>',
        '                <option value="PRODUCTION">PRODUCTION (Vendor/Service)</option>',
        '                <option value="OTHER">OTHER</option>',
        '              </select>',
        '            </div>',
        '            <div class="form-group">',
        '              <label class="form-label">Beneficiary Type *</label>',
        '              <select class="form-control" ng-model="vm.payoutForm.beneficiary_type" required>',
        '                <option value="NOMINEE">NOMINEE</option>',
        '                <option value="CONTESTANT">CONTESTANT</option>',
        '                <option value="VENDOR">VENDOR</option>',
        '                <option value="STAFF">STAFF</option>',
        '              </select>',
        '            </div>',
        '          </div>',
        '          <div class="grid-2 mb-2">',
        '            <div class="form-group">',
        '              <label class="form-label">Beneficiary Legal Name *</label>',
        '              <input type="text" class="form-control" ng-model="vm.payoutForm.beneficiary_name" placeholder="Matching legal ID" required />',
        '            </div>',
        '            <div class="form-group">',
        '              <label class="form-label">Beneficiary Phone / Contact</label>',
        '              <input type="text" class="form-control" ng-model="vm.payoutForm.beneficiary_contact" placeholder="+233..." />',
        '            </div>',
        '          </div>',
        '          <div class="grid-3 mb-2">',
        '            <div class="form-group">',
        '              <label class="form-label">Gross Amount (GHS) *</label>',
        '              <input type="number" step="0.01" min="1" class="form-control" ng-model="vm.payoutForm.amount_major" placeholder="10000.00" required />',
        '            </div>',
        '            <div class="form-group">',
        '              <label class="form-label">GRA Withholding (%)</label>',
        '              <select class="form-control" ng-model="vm.payoutForm.tax_withheld_percent">',
        '                <option ng-value="0">0% (Exempt)</option>',
        '                <option ng-value="5.0">5.0% (Standard Withholding)</option>',
        '                <option ng-value="7.5">7.5% (Services / Production)</option>',
        '                <option ng-value="15.0">15.0% (Special Non-Resident)</option>',
        '              </select>',
        '            </div>',
        '            <div class="form-group">',
        '              <label class="form-label">Net Payable (GHS)</label>',
        '              <div class="form-control" style="background:var(--bg-surface-2);font-weight:700;color:#10b981;">{{ vm.calcNetPayout() | ghsCurrency:"GHS" }}</div>',
        '            </div>',
        '          </div>',
        '          <div class="grid-2 mb-2">',
        '            <div class="form-group">',
        '              <label class="form-label">Payment Method *</label>',
        '              <select class="form-control" ng-model="vm.payoutForm.payment_method" required>',
        '                <option value="BANK_TRANSFER">Bank Wire / Transfer</option>',
        '                <option value="MOBILE_MONEY">Mobile Money (MTN / Telecel / AT)</option>',
        '                <option value="ESCROW">Escrow Trust (Minors)</option>',
        '                <option value="CHEQUE">Cheque</option>',
        '              </select>',
        '            </div>',
        '            <div class="form-group">',
        '              <label class="form-label">Bank or MoMo Account Details</label>',
        '              <input type="text" class="form-control" ng-model="vm.payoutForm.account_details" placeholder="Bank name, branch &amp; ACC number" />',
        '            </div>',
        '          </div>',
        '          <div class="form-group mb-2">',
        '            <label class="form-label">Governance Notes &amp; Audit Reference</label>',
        '            <textarea class="form-control" rows="2" ng-model="vm.payoutForm.notes" placeholder="Milestone notes, Ghana Card verification..."></textarea>',
        '          </div>',
        '          <div class="form-group">',
        '            <label style="display:flex;align-items:center;gap:8px;font-size:0.85rem;cursor:pointer;">',
        '              <input type="checkbox" ng-model="vm.payoutForm.auto_approve" />',
        '              <span>Auto-approve disbursement (finance pre-authorization)</span>',
        '            </label>',
        '          </div>',
        '        </div>',
        '        <div class="modal-footer">',
        '          <button type="button" class="btn btn-secondary" ng-click="vm.showCreateModal=false">Cancel</button>',
        '          <button type="submit" class="btn btn-primary">Schedule Payout</button>',
        '        </div>',
        '      </form>',
        '    </div>',
        '',
        '    <!-- Confirm Disburse Modal -->',
        '    <div class="modal-backdrop" ng-if="vm.showDisburseModal" ng-click="vm.showDisburseModal=false"></div>',
        '    <div class="modal-dialog" ng-if="vm.showDisburseModal">',
        '      <div class="modal-header">',
        '        <h3 style="margin:0;"><th-icon name="credit-card" size="18"></th-icon> Confirm Payout Disbursal</h3>',
        '        <button type="button" class="btn-close" ng-click="vm.showDisburseModal=false">&times;</button>',
        '      </div>',
        '      <form ng-submit="vm.confirmDisburse()">',
        '        <div class="modal-body">',
        '          <p>You are marking payout <code>{{ vm.activePayout.reference_no }}</code> for <strong>{{ vm.activePayout.beneficiary_name }}</strong> as disbursed.</p>',
        '          <div class="kpi-mini-card mb-2">',
        '            <div class="kpi-label">Disbursement Amount</div>',
        '            <div class="kpi-value" style="color:#10b981;">{{ vm.activePayout.net_amount_major | ghsCurrency:"GHS" }}</div>',
        '            <div class="kpi-sub">Gross: {{ vm.activePayout.amount_major | ghsCurrency:"GHS" }} | Tax Withheld: {{ vm.activePayout.tax_withheld_major | ghsCurrency:"GHS" }}</div>',
        '          </div>',
        '          <div class="form-group mb-2">',
        '            <label class="form-label">Bank Wire / MoMo Transaction Reference *</label>',
        '            <input type="text" class="form-control" ng-model="vm.disburseForm.transaction_reference" placeholder="e.g. BFT-2026-904128 or MM-GH-4921008" required />',
        '          </div>',
        '          <div class="muted" style="font-size:0.82rem;">This action updates the payout status to <strong>DISBURSED</strong> and records an immutable audit log entry.</div>',
        '        </div>',
        '        <div class="modal-footer">',
        '          <button type="button" class="btn btn-secondary" ng-click="vm.showDisburseModal=false">Cancel</button>',
        '          <button type="submit" class="btn btn-success">Confirm Disbursal</button>',
        '        </div>',
        '      </form>',
        '    </div>',
        '  </div>',
        '</div>'
      ].join(''));
    }]);
})();
