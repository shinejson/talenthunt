(function () {
  'use strict';

  angular.module('talentHuntApp')
    .controller('AdminVotesController', ['ApiService', 'PermissionsService', 'ToastService',
      function (ApiService, PermissionsService, ToastService) {
        var vm = this;
        vm.perms = PermissionsService;
        vm.entries = [];
        vm.meta = {};
        vm.nominees = [];
        vm.rounds = [];
        vm.adj = { nominee_id: '', round_id: '', quantity: 0, reason: '', approval_reference: '' };

        ApiService.get('/admin/nominees').then(function (res) { vm.nominees = res.data || []; });
        ApiService.get('/admin/rounds').then(function (res) { vm.rounds = res.data || []; });

        vm.load = function (page) {
          ApiService.get('/admin/votes', { page: page || 1 }).then(function (res) {
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
    .controller('AdminOrdersController', ['ApiService', function (ApiService) {
      var vm = this;
      vm.orders = [];
      vm.meta = {};
      vm.statusFilter = '';

      vm.load = function (page) {
        ApiService.get('/admin/orders', { status: vm.statusFilter, page: page || 1 }).then(function (res) {
          vm.orders = res.data || [];
          vm.meta = res.meta || {};
        });
      };

      vm.load(1);
    }])
    .controller('AdminReconciliationController', ['ApiService', 'PermissionsService', 'ToastService',
      function (ApiService, PermissionsService, ToastService) {
        var vm = this;
        vm.perms = PermissionsService;
        vm.payments = [];
        vm.webhooks = [];
        vm.meta = {};
        vm.statusFilter = '';

        vm.load = function (page) {
          ApiService.get('/admin/payments', { status: vm.statusFilter, page: page || 1 }).then(function (res) {
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
        '      <h1 style="margin-top:0;font-size:1.5rem;">Immutable Vote Ledger</h1>',
        '      <div class="table-responsive">',
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
        '      <select class="form-control" style="max-width:200px;" ng-model="vm.statusFilter" ng-change="vm.load(1)">',
        '        <option value="">All Statuses</option><option value="PAID">PAID</option><option value="PENDING_PAYMENT">PENDING_PAYMENT</option><option value="FAILED">FAILED</option><option value="QUARANTINED">QUARANTINED</option><option value="REFUNDED">REFUNDED</option>',
        '      </select>',
        '    </div>',
        '    <div class="table-responsive">',
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
        '        <div class="inline-actions">',
        '          <select class="form-control" style="width:170px;" ng-model="vm.statusFilter" ng-change="vm.load(1)"><option value="">All Statuses</option><option value="SUCCESS">SUCCESS</option><option value="PENDING">PENDING</option><option value="QUARANTINED">QUARANTINED</option><option value="REFUNDED">REFUNDED</option><option value="FAILED">FAILED</option></select>',
        '          <button type="button" class="btn btn-primary" ng-click="vm.reconcileBatch()">Reconcile All Pending</button>',
        '        </div>',
        '      </div>',
        '      <div class="table-responsive">',
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
        '      <div class="table-responsive">',
        '        <table class="data-table">',
        '          <thead><tr><th>Received</th><th>Provider</th><th>Event ID</th><th>Signature</th><th>Status</th><th>Notes</th></tr></thead>',
        '          <tbody><tr ng-repeat="w in vm.webhooks"><td>{{ w.received_at | date:"short" }}</td><td>{{ w.provider }}</td><td><code>{{ w.event_id }}</code></td><td>{{ w.signature_valid ? "Valid ✓" : "Invalid" }}</td><td><th-status-badge status="w.status"></th-status-badge></td><td>{{ w.notes }}</td></tr></tbody>',
        '        </table>',
        '      </div>',
        '    </div>',
        '  </div>',
        '</div>'
      ].join(''));
    }]);
})();
