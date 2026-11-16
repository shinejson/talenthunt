(function () {
  'use strict';

  angular.module('talentHuntApp')
    .controller('AdminVotesController', ['ApiService', 'PermissionsService', 'ToastService', 'AdminFilterUtils',
      function (ApiService, PermissionsService, ToastService, AdminFilterUtils) {
        var vm = this;
        vm.perms = PermissionsService;
        vm.entries = [];
        vm.meta = {};
        vm.nominees = [];
        vm.rounds = [];
        vm.filters = {
          q: '',
          entry_type: '',
          round_id: '',
          nominee_id: '',
          date_from: null,
          date_to: null
        };
        vm.adj = { nominee_id: '', round_id: '', quantity: 0, reason: '', approval_reference: '' };

        ApiService.get('/admin/nominees', { per_page: 100 }).then(function (res) { vm.nominees = res.data || []; });
        ApiService.get('/admin/rounds').then(function (res) { vm.rounds = res.data || []; });

        vm.activeFilterCount = function () {
          return AdminFilterUtils.countActive(vm.filters);
        };

        vm.resetFilters = function () {
          vm.filters = { q: '', entry_type: '', round_id: '', nominee_id: '', date_from: null, date_to: null };
          vm.load(1);
        };

        vm.load = function (page) {
          var params = AdminFilterUtils.cleanParams(vm.filters);
          params.page = page || 1;
          ApiService.get('/admin/votes', params).then(function (res) {
            vm.entries = res.data || [];
            vm.meta = res.meta || {};
          });
        };

        vm.submitAdjustment = function () {
          ApiService.post('/admin/votes/adjustments', vm.adj).then(function () {
            ToastService.success('Audited vote ledger adjustment recorded.');
            vm.adj = { nominee_id: '', round_id: '', quantity: 0, reason: '', approval_reference: '' };
            vm.load(1);
          }, function (err) { ToastService.error(err.message); });
        };

        vm.load(1);
      }
    ])
    .controller('AdminOrdersController', ['ApiService', 'AdminFilterUtils',
      function (ApiService, AdminFilterUtils) {
        var vm = this;
        vm.orders = [];
        vm.meta = {};
        vm.nominees = [];
        vm.rounds = [];
        vm.filters = {
          q: '',
          status: '',
          payment_channel: '',
          round_id: '',
          nominee_id: '',
          date_from: null,
          date_to: null
        };

        ApiService.get('/admin/nominees', { per_page: 100 }).then(function (res) { vm.nominees = res.data || []; });
        ApiService.get('/admin/rounds').then(function (res) { vm.rounds = res.data || []; });

        vm.activeFilterCount = function () {
          return AdminFilterUtils.countActive(vm.filters);
        };

        vm.resetFilters = function () {
          vm.filters = { q: '', status: '', payment_channel: '', round_id: '', nominee_id: '', date_from: null, date_to: null };
          vm.load(1);
        };

        vm.load = function (page) {
          var params = AdminFilterUtils.cleanParams(vm.filters);
          params.page = page || 1;
          ApiService.get('/admin/orders', params).then(function (res) {
            vm.orders = res.data || [];
            vm.meta = res.meta || {};
          });
        };

        vm.load(1);
      }
    ])
    .controller('AdminReconciliationController', ['ApiService', 'PermissionsService', 'ToastService', 'AdminFilterUtils',
      function (ApiService, PermissionsService, ToastService, AdminFilterUtils) {
        var vm = this;
        vm.perms = PermissionsService;
        vm.payments = [];
        vm.webhooks = [];
        vm.meta = {};
        vm.filters = {
          q: '',
          status: '',
          provider: '',
          channel: '',
          date_from: null,
          date_to: null
        };
        vm.whFilters = {
          q: '',
          status: '',
          sig: ''
        };

        vm.activeFilterCount = function () {
          return AdminFilterUtils.countActive(vm.filters);
        };

        vm.resetFilters = function () {
          vm.filters = { q: '', status: '', provider: '', channel: '', date_from: null, date_to: null };
          vm.load(1);
        };

        vm.activeWhFilterCount = function () {
          return AdminFilterUtils.countActive(vm.whFilters);
        };

        vm.resetWhFilters = function () {
          vm.whFilters = { q: '', status: '', sig: '' };
        };

        vm.filteredWebhooks = function () {
          var list = vm.webhooks || [];
          var q = (vm.whFilters.q || '').trim().toLowerCase();
          var st = vm.whFilters.status;
          var sig = vm.whFilters.sig;
          return list.filter(function (w) {
            if (st && w.status !== st) return false;
            if (sig === 'valid' && !w.signature_valid) return false;
            if (sig === 'invalid' && w.signature_valid) return false;
            if (q) {
              var hay = ((w.event_id || '') + ' ' + (w.provider || '') + ' ' + (w.notes || '')).toLowerCase();
              if (hay.indexOf(q) === -1) return false;
            }
            return true;
          });
        };

        vm.load = function (page) {
          var params = AdminFilterUtils.cleanParams(vm.filters);
          params.page = page || 1;
          ApiService.get('/admin/payments', params).then(function (res) {
            vm.payments = res.data || [];
            vm.meta = res.meta || {};
            vm.webhooks = (res.meta && res.meta.recent_webhooks) || [];
          });
        };

        vm.reconcileOne = function (p) {
          ApiService.post('/admin/payments/' + p.id + '/reconcile', {}).then(function (res) {
            ToastService.success('Reconciled (' + res.data.outcome + ').');
            vm.load(vm.meta.page);
          }, function (err) { ToastService.error(err.message); });
        };

        vm.reconcileBatch = function () {
          ApiService.post('/admin/payments/reconcile-pending', {}).then(function (res) {
            ToastService.success('Checked ' + res.data.checked + ' pending payments; credited ' + res.data.credited + '.');
            vm.load(1);
          }, function (err) { ToastService.error(err.message); });
        };

        vm.refund = function (p) {
          var reason = window.prompt('Enter approved refund / chargeback reason for ' + p.provider_reference + ':');
          if (!reason) return;
          ApiService.post('/admin/payments/' + p.id + '/refund', { reason: reason }).then(function () {
            ToastService.success('Payment refunded and compensating REVERSAL recorded on vote ledger.');
            vm.load(vm.meta.page);
          }, function (err) { ToastService.error(err.message); });
        };

        vm.load(1);
      }
    ])
    .run(['$templateCache', function ($templateCache) {
      $templateCache.put('admin/votes.html', [
        '<div class="container portal-layout">',
        '  <th-admin-nav></th-admin-nav>',
        '  <div>',
        '    <div class="card mb-3" ng-if="vm.perms.isSuperAdmin()">',
        '      <h3 style="margin-top:0;">Record Audited Vote Adjustment (Super Admin Only)</h3>',
        '      <p class="muted" style="font-size:0.85rem;">Direct editing of vote counts is prohibited. Corrections are recorded as immutable append-only ledger entries with reason and second-person approval reference.</p>',
        '      <form class="grid-3" ng-submit="vm.submitAdjustment()">',
        '        <select class="form-control" ng-model="vm.adj.nominee_id" required><option value="">Select Nominee...</option><option ng-repeat="n in vm.nominees" value="{{ n.id }}">{{ n.public_name }}</option></select>',
        '        <select class="form-control" ng-model="vm.adj.round_id" required><option value="">Select Round...</option><option ng-repeat="r in vm.rounds" value="{{ r.id }}">{{ r.name }}</option></select>',
        '        <input type="number" class="form-control" ng-model="vm.adj.quantity" placeholder="Signed votes (e.g. -5 or +5)" required />',
        '        <input type="text" class="form-control" ng-model="vm.adj.approval_reference" placeholder="2nd-Person Approval Ref *" required />',
        '        <input type="text" class="form-control" ng-model="vm.adj.reason" placeholder="Detailed audit reason *" required />',
        '        <button type="submit" class="btn btn-primary">Append Adjustment</button>',
        '      </form>',
        '    </div>',
        '    <div class="card">',
        '      <div class="flex-between mb-2">',
        '        <h1 style="margin:0;font-size:1.5rem;">Immutable Vote Ledger</h1>',
        '        <button type="button" class="btn btn-sm btn-secondary" ng-click="vm.load(vm.meta.page || 1)"><th-icon name="refresh" size="14"></th-icon><span>Refresh</span></button>',
        '      </div>',

        '      <div class="filter-bar">',
        '        <div class="filter-bar-top">',
        '          <span class="filter-bar-title"><th-icon name="filter" size="14"></th-icon><span>Filter Ledger Entries</span></span>',
        '          <div class="inline-actions">',
        '            <span class="filter-count-pill">{{ vm.meta.total !== undefined ? vm.meta.total : vm.entries.length }} entry(s)</span>',
        '            <button type="button" class="btn btn-sm btn-secondary" ng-if="vm.activeFilterCount() > 0" ng-click="vm.resetFilters()"><th-icon name="rotate-ccw" size="14"></th-icon><span>Reset</span></button>',
        '          </div>',
        '        </div>',
        '        <div class="filter-bar-grid">',
        '          <div class="filter-field-search">',
        '            <label class="filter-label">Search</label>',
        '            <div class="search-input-wrap">',
        '              <th-icon name="search" size="15"></th-icon>',
        '              <input type="text" class="form-control form-control-sm" ng-model="vm.filters.q" ng-model-options="{ debounce: 250 }" ng-change="vm.load(1)" placeholder="Order ref, nominee, reason, approval ref..." />',
        '            </div>',
        '          </div>',
        '          <div class="filter-field">',
        '            <label class="filter-label">Entry Type</label>',
        '            <select class="form-control form-control-sm" ng-model="vm.filters.entry_type" ng-change="vm.load(1)">',
        '              <option value="">All Types</option>',
        '              <option value="CREDIT">CREDIT</option>',
        '              <option value="REVERSAL">REVERSAL</option>',
        '              <option value="ADJUSTMENT">ADJUSTMENT</option>',
        '            </select>',
        '          </div>',
        '          <div class="filter-field">',
        '            <label class="filter-label">Round</label>',
        '            <select class="form-control form-control-sm" ng-model="vm.filters.round_id" ng-change="vm.load(1)">',
        '              <option value="">All Rounds</option>',
        '              <option ng-repeat="r in vm.rounds" value="{{ r.id }}">{{ r.name }}</option>',
        '            </select>',
        '          </div>',
        '          <div class="filter-field">',
        '            <label class="filter-label">Nominee</label>',
        '            <select class="form-control form-control-sm" ng-model="vm.filters.nominee_id" ng-change="vm.load(1)">',
        '              <option value="">All Nominees</option>',
        '              <option ng-repeat="n in vm.nominees" value="{{ n.id }}">{{ n.public_name }}</option>',
        '            </select>',
        '          </div>',
        '          <div class="filter-field-date">',
        '            <label class="filter-label">From Date</label>',
        '            <input type="date" class="form-control form-control-sm" ng-model="vm.filters.date_from" ng-change="vm.load(1)" />',
        '          </div>',
        '          <div class="filter-field-date">',
        '            <label class="filter-label">To Date</label>',
        '            <input type="date" class="form-control form-control-sm" ng-model="vm.filters.date_to" ng-change="vm.load(1)" />',
        '          </div>',
        '        </div>',
        '      </div>',

        '      <div ng-if="!vm.entries.length" class="empty-state">No vote ledger entries match the selected filters.</div>',
        '      <div class="table-responsive" ng-if="vm.entries.length">',
        '        <table class="data-table">',
        '          <thead><tr><th>Timestamp</th><th>Type</th><th>Nominee</th><th>Round</th><th>Quantity</th><th>Order Ref</th><th>Reason / Approval</th></tr></thead>',
        '          <tbody>',
        '            <tr ng-repeat="le in vm.entries">',
        '              <td>{{ le.created_at | date:"short" }}</td>',
        '              <td><th-status-badge status="le.entry_type"></th-status-badge></td>',
        '              <td><strong>{{ le.nominee_name }}</strong></td>',
        '              <td>{{ le.round_name }}</td>',
        '              <td><strong>{{ le.quantity > 0 ? ("+" + le.quantity) : le.quantity }}</strong></td>',
        '              <td><code>{{ le.order_reference || "-" }}</code></td>',
        '              <td class="muted">{{ le.reason }} <span ng-if="le.approval_reference">({{ le.approval_reference }})</span></td>',
        '            </tr>',
        '          </tbody>',
        '        </table>',
        '      </div>',
        '      <th-pagination meta="vm.meta" on-page="vm.load(page)"></th-pagination>',
        '    </div>',
        '  </div>',
        '</div>'
      ].join(''));

      $templateCache.put('admin/orders.html', [
        '<div class="container portal-layout">',
        '  <th-admin-nav></th-admin-nav>',
        '  <div class="card">',
        '    <div class="flex-between mb-2">',
        '      <h1 style="margin:0;font-size:1.5rem;">Vote Orders</h1>',
        '      <button type="button" class="btn btn-sm btn-secondary" ng-click="vm.load(vm.meta.page || 1)"><th-icon name="refresh" size="14"></th-icon><span>Refresh</span></button>',
        '    </div>',

        '    <div class="filter-bar">',
        '      <div class="filter-bar-top">',
        '        <span class="filter-bar-title"><th-icon name="filter" size="14"></th-icon><span>Filter Orders</span></span>',
        '        <div class="inline-actions">',
        '          <span class="filter-count-pill">{{ vm.meta.total !== undefined ? vm.meta.total : vm.orders.length }} order(s)</span>',
        '          <button type="button" class="btn btn-sm btn-secondary" ng-if="vm.activeFilterCount() > 0" ng-click="vm.resetFilters()"><th-icon name="rotate-ccw" size="14"></th-icon><span>Reset</span></button>',
        '        </div>',
        '      </div>',
        '      <div class="filter-bar-grid">',
        '        <div class="filter-field-search">',
        '          <label class="filter-label">Search</label>',
        '          <div class="search-input-wrap">',
        '            <th-icon name="search" size="15"></th-icon>',
        '            <input type="text" class="form-control form-control-sm" ng-model="vm.filters.q" ng-model-options="{ debounce: 250 }" ng-change="vm.load(1)" placeholder="Order ref, receipt, nominee, voter..." />',
        '          </div>',
        '        </div>',
        '        <div class="filter-field">',
        '          <label class="filter-label">Status</label>',
        '          <select class="form-control form-control-sm" ng-model="vm.filters.status" ng-change="vm.load(1)">',
        '            <option value="">All Statuses</option>',
        '            <option value="PAID">PAID</option>',
        '            <option value="PENDING_PAYMENT">PENDING_PAYMENT</option>',
        '            <option value="FAILED">FAILED</option>',
        '            <option value="QUARANTINED">QUARANTINED</option>',
        '            <option value="REFUNDED">REFUNDED</option>',
        '          </select>',
        '        </div>',
        '        <div class="filter-field">',
        '          <label class="filter-label">Payment Channel</label>',
        '          <select class="form-control form-control-sm" ng-model="vm.filters.payment_channel" ng-change="vm.load(1)">',
        '            <option value="">All Channels</option>',
        '            <option value="mobile_money">Mobile Money</option>',
        '            <option value="card">Card</option>',
        '          </select>',
        '        </div>',
        '        <div class="filter-field">',
        '          <label class="filter-label">Round</label>',
        '          <select class="form-control form-control-sm" ng-model="vm.filters.round_id" ng-change="vm.load(1)">',
        '            <option value="">All Rounds</option>',
        '            <option ng-repeat="r in vm.rounds" value="{{ r.id }}">{{ r.name }}</option>',
        '          </select>',
        '        </div>',
        '        <div class="filter-field">',
        '          <label class="filter-label">Nominee</label>',
        '          <select class="form-control form-control-sm" ng-model="vm.filters.nominee_id" ng-change="vm.load(1)">',
        '            <option value="">All Nominees</option>',
        '            <option ng-repeat="n in vm.nominees" value="{{ n.id }}">{{ n.public_name }}</option>',
        '          </select>',
        '        </div>',
        '        <div class="filter-field-date">',
        '          <label class="filter-label">From Date</label>',
        '          <input type="date" class="form-control form-control-sm" ng-model="vm.filters.date_from" ng-change="vm.load(1)" />',
        '        </div>',
        '        <div class="filter-field-date">',
        '          <label class="filter-label">To Date</label>',
        '          <input type="date" class="form-control form-control-sm" ng-model="vm.filters.date_to" ng-change="vm.load(1)" />',
        '        </div>',
        '      </div>',
        '    </div>',

        '    <div ng-if="!vm.orders.length" class="empty-state">No vote orders match the selected filters.</div>',
        '    <div class="table-responsive" ng-if="vm.orders.length">',
        '      <table class="data-table">',
        '        <thead><tr><th>Order Ref</th><th>Receipt</th><th>Nominee</th><th>Votes</th><th>Amount</th><th>Status</th><th>Created</th></tr></thead>',
        '        <tbody>',
        '          <tr ng-repeat="o in vm.orders">',
        '            <td><code>{{ o.public_reference }}</code></td>',
        '            <td><code>{{ o.receipt_code || "-" }}</code></td>',
        '            <td>{{ o.nominee_name }}</td>',
        '            <td>{{ o.vote_quantity }}</td>',
        '            <td>{{ o.amount_major | ghsCurrency:o.currency }}</td>',
        '            <td><th-status-badge status="o.status"></th-status-badge></td>',
        '            <td>{{ o.created_at | date:"short" }}</td>',
        '          </tr>',
        '        </tbody>',
        '      </table>',
        '    </div>',
        '    <th-pagination meta="vm.meta" on-page="vm.load(page)"></th-pagination>',
        '  </div>',
        '</div>'
      ].join(''));

      $templateCache.put('admin/reconciliation.html', [
        '<div class="container portal-layout">',
        '  <th-admin-nav></th-admin-nav>',
        '  <div>',
        '    <div class="card mb-3">',
        '      <div class="flex-between mb-2">',
        '        <h1 style="margin:0;font-size:1.5rem;">Payments, Webhooks &amp; Reconciliation</h1>',
        '        <button type="button" class="btn btn-primary" ng-click="vm.reconcileBatch()"><th-icon name="refresh" size="15"></th-icon><span>Reconcile All Pending</span></button>',
        '      </div>',

        '      <div class="filter-bar">',
        '        <div class="filter-bar-top">',
        '          <span class="filter-bar-title"><th-icon name="filter" size="14"></th-icon><span>Filter Payments</span></span>',
        '          <div class="inline-actions">',
        '            <span class="filter-count-pill">{{ vm.meta.total !== undefined ? vm.meta.total : vm.payments.length }} payment(s)</span>',
        '            <button type="button" class="btn btn-sm btn-secondary" ng-if="vm.activeFilterCount() > 0" ng-click="vm.resetFilters()"><th-icon name="rotate-ccw" size="14"></th-icon><span>Reset</span></button>',
        '          </div>',
        '        </div>',
        '        <div class="filter-bar-grid">',
        '          <div class="filter-field-search">',
        '            <label class="filter-label">Search</label>',
        '            <div class="search-input-wrap">',
        '              <th-icon name="search" size="15"></th-icon>',
        '              <input type="text" class="form-control form-control-sm" ng-model="vm.filters.q" ng-model-options="{ debounce: 250 }" ng-change="vm.load(1)" placeholder="Provider ref, order ref, nominee..." />',
        '            </div>',
        '          </div>',
        '          <div class="filter-field">',
        '            <label class="filter-label">Status</label>',
        '            <select class="form-control form-control-sm" ng-model="vm.filters.status" ng-change="vm.load(1)">',
        '              <option value="">All Statuses</option>',
        '              <option value="SUCCESS">SUCCESS</option>',
        '              <option value="PENDING">PENDING</option>',
        '              <option value="INITIALIZED">INITIALIZED</option>',
        '              <option value="QUARANTINED">QUARANTINED</option>',
        '              <option value="REFUNDED">REFUNDED</option>',
        '              <option value="FAILED">FAILED</option>',
        '            </select>',
        '          </div>',
        '          <div class="filter-field">',
        '            <label class="filter-label">Provider</label>',
        '            <select class="form-control form-control-sm" ng-model="vm.filters.provider" ng-change="vm.load(1)">',
        '              <option value="">All Providers</option>',
        '              <option value="mock">GhanaPay Sandbox (mock)</option>',
        '              <option value="paystack">Paystack</option>',
        '            </select>',
        '          </div>',
        '          <div class="filter-field">',
        '            <label class="filter-label">Channel</label>',
        '            <select class="form-control form-control-sm" ng-model="vm.filters.channel" ng-change="vm.load(1)">',
        '              <option value="">All Channels</option>',
        '              <option value="mobile_money">Mobile Money</option>',
        '              <option value="card">Card</option>',
        '            </select>',
        '          </div>',
        '          <div class="filter-field-date">',
        '            <label class="filter-label">From Date</label>',
        '            <input type="date" class="form-control form-control-sm" ng-model="vm.filters.date_from" ng-change="vm.load(1)" />',
        '          </div>',
        '          <div class="filter-field-date">',
        '            <label class="filter-label">To Date</label>',
        '            <input type="date" class="form-control form-control-sm" ng-model="vm.filters.date_to" ng-change="vm.load(1)" />',
        '          </div>',
        '        </div>',
        '      </div>',

        '      <div ng-if="!vm.payments.length" class="empty-state">No payment records match the selected filters.</div>',
        '      <div class="table-responsive" ng-if="vm.payments.length">',
        '        <table class="data-table">',
        '          <thead><tr><th>Provider Ref</th><th>Order</th><th>Nominee</th><th>Amount</th><th>Status</th><th>Actions</th></tr></thead>',
        '          <tbody>',
        '            <tr ng-repeat="p in vm.payments">',
        '              <td><code>{{ p.provider_reference }}</code></td>',
        '              <td><code>{{ p.order_reference }}</code></td>',
        '              <td>{{ p.nominee_name }} ({{ p.vote_quantity }}v)</td>',
        '              <td>{{ p.amount_major | ghsCurrency:p.currency }}</td>',
        '              <td><th-status-badge status="p.status"></th-status-badge></td>',
        '              <td class="inline-actions">',
        '                <button ng-if="p.status === \'PENDING\' || p.status === \'INITIALIZED\'" type="button" class="btn btn-sm btn-secondary" ng-click="vm.reconcileOne(p)">Inquire &amp; Reconcile</button>',
        '                <button ng-if="p.status === \'SUCCESS\' && vm.perms.canRefund()" type="button" class="btn btn-sm btn-danger" ng-click="vm.refund(p)">Refund &amp; Reverse</button>',
        '              </td>',
        '            </tr>',
        '          </tbody>',
        '        </table>',
        '      </div>',
        '      <th-pagination meta="vm.meta" on-page="vm.load(page)"></th-pagination>',
        '    </div>',

        '    <div class="card" ng-if="vm.webhooks.length">',
        '      <h3 style="margin-top:0;">Recent Signed Webhook Events</h3>',
        '      <div class="filter-bar">',
        '        <div class="filter-bar-top">',
        '          <span class="filter-bar-title"><th-icon name="filter" size="14"></th-icon><span>Filter Webhook Events</span></span>',
        '          <div class="inline-actions">',
        '            <span class="filter-count-pill">{{ vm.filteredWebhooks().length }} of {{ vm.webhooks.length }}</span>',
        '            <button type="button" class="btn btn-sm btn-secondary" ng-if="vm.activeWhFilterCount() > 0" ng-click="vm.resetWhFilters()"><th-icon name="rotate-ccw" size="14"></th-icon><span>Reset</span></button>',
        '          </div>',
        '        </div>',
        '        <div class="filter-bar-grid">',
        '          <div class="filter-field-search">',
        '            <label class="filter-label">Search Event</label>',
        '            <div class="search-input-wrap">',
        '              <th-icon name="search" size="15"></th-icon>',
        '              <input type="text" class="form-control form-control-sm" ng-model="vm.whFilters.q" placeholder="Event ID, provider, notes..." />',
        '            </div>',
        '          </div>',
        '          <div class="filter-field">',
        '            <label class="filter-label">Webhook Status</label>',
        '            <select class="form-control form-control-sm" ng-model="vm.whFilters.status">',
        '              <option value="">All Statuses</option>',
        '              <option value="PROCESSED">PROCESSED</option>',
        '              <option value="DUPLICATE">DUPLICATE</option>',
        '              <option value="QUARANTINED">QUARANTINED</option>',
        '              <option value="FAILED">FAILED</option>',
        '            </select>',
        '          </div>',
        '          <div class="filter-field">',
        '            <label class="filter-label">HMAC Signature</label>',
        '            <select class="form-control form-control-sm" ng-model="vm.whFilters.sig">',
        '              <option value="">All Signatures</option>',
        '              <option value="valid">Valid Signature</option>',
        '              <option value="invalid">Invalid Signature</option>',
        '            </select>',
        '          </div>',
        '        </div>',
        '      </div>',
        '      <div ng-if="!vm.filteredWebhooks().length" class="empty-state">No webhook events match the selected filters.</div>',
        '      <div class="table-responsive" ng-if="vm.filteredWebhooks().length">',
        '        <table class="data-table">',
        '          <thead><tr><th>Received</th><th>Provider</th><th>Event ID</th><th>Signature</th><th>Status</th><th>Notes</th></tr></thead>',
        '          <tbody><tr ng-repeat="w in vm.filteredWebhooks()"><td>{{ w.received_at | date:"short" }}</td><td>{{ w.provider }}</td><td><code>{{ w.event_id }}</code></td><td>{{ w.signature_valid ? "Valid ✓" : "Invalid" }}</td><td><th-status-badge status="w.status"></th-status-badge></td><td>{{ w.notes }}</td></tr></tbody>',
        '        </table>',
        '      </div>',
        '    </div>',
        '  </div>',
        '</div>'
      ].join(''));
    }]);
})();
