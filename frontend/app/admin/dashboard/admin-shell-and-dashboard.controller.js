(function () {
  'use strict';

  angular.module('talentHuntApp')
    .component('thAdminNav', {
      template: [
        '<aside class="side-nav" aria-label="Admin Navigation">',
        '  <div class="side-nav-title">Admin Console</div>',
        '  <a href="/admin" ng-class="{active: $ctrl.is(\'/admin\')}">KPI Overview</a>',
        '  <a ng-if="$ctrl.perms.canManageCompetition()" href="/admin/competitions" ng-class="{active: $ctrl.is(\'/admin/competitions\')}">Competitions</a>',
        '  <a ng-if="$ctrl.perms.canManageCompetition()" href="/admin/categories" ng-class="{active: $ctrl.is(\'/admin/categories\')}">Categories</a>',
        '  <a ng-if="$ctrl.perms.canManageCompetition()" href="/admin/rounds" ng-class="{active: $ctrl.is(\'/admin/rounds\')}">Rounds &amp; Packages</a>',
        '  <a ng-if="$ctrl.perms.canReview() || $ctrl.perms.canModerate()" href="/admin/submissions" ng-class="{active: $ctrl.is(\'/admin/submissions\')}">Review Queue</a>',
        '  <a ng-if="$ctrl.perms.canManageCompetition() || $ctrl.perms.canModerate() || $ctrl.perms.canFinance()" href="/admin/nominees" ng-class="{active: $ctrl.is(\'/admin/nominees\')}">Nominees</a>',
        '  <a ng-if="$ctrl.perms.canFinance()" href="/admin/votes" ng-class="{active: $ctrl.is(\'/admin/votes\')}">Vote Ledger</a>',
        '  <a ng-if="$ctrl.perms.canFinance()" href="/admin/orders" ng-class="{active: $ctrl.is(\'/admin/orders\')}">Orders</a>',
        '  <a ng-if="$ctrl.perms.canFinance()" href="/admin/reconciliation" ng-class="{active: $ctrl.is(\'/admin/reconciliation\')}">Payments &amp; Reconcile</a>',
        '  <a ng-if="$ctrl.perms.canManageCompetition()" href="/admin/eliminations" ng-class="{active: $ctrl.is(\'/admin/eliminations\')}">Eliminations</a>',
        '  <a ng-if="$ctrl.perms.canModerate() || $ctrl.perms.canFinance()" href="/admin/moderation" ng-class="{active: $ctrl.is(\'/admin/moderation\')}">Moderation &amp; Support</a>',
        '  <a ng-if="$ctrl.perms.canFinance()" href="/admin/reports" ng-class="{active: $ctrl.is(\'/admin/reports\')}">Reports &amp; CSV</a>',
        '  <a ng-if="$ctrl.perms.canFinance()" href="/admin/audit-logs" ng-class="{active: $ctrl.is(\'/admin/audit-logs\')}">Audit Logs</a>',
        '  <a ng-if="$ctrl.perms.isSuperAdmin()" href="/admin/users" ng-class="{active: $ctrl.is(\'/admin/users\')}">Users &amp; Roles</a>',
        '  <a ng-if="$ctrl.perms.canManageCompetition()" href="/admin/settings" ng-class="{active: $ctrl.is(\'/admin/settings\')}">Platform Settings</a>',
        '</aside>'
      ].join(''),
      controller: ['$location', 'PermissionsService', function ($location, PermissionsService) {
        var vm = this;
        vm.perms = PermissionsService;
        vm.is = function (p) { return $location.path() === p; };
      }]
    })
    .controller('AdminDashboardController', ['ApiService', 'PermissionsService', 'ToastService',
      function (ApiService, PermissionsService, ToastService) {
        var vm = this;
        vm.perms = PermissionsService;
        vm.loading = true;
        vm.data = null;
        vm.pauseForm = { paused: false, incident_message: '' };

        vm.load = function () {
          ApiService.get('/admin/dashboard').then(function (res) {
            vm.data = res.data;
            if (vm.data.incident_banner) {
              vm.pauseForm.paused = vm.data.incident_banner.global_voting_paused;
              vm.pauseForm.incident_message = vm.data.incident_banner.message || '';
            }
            vm.loading = false;
          }, function () { vm.loading = false; });
        };

        vm.applyPause = function (paused) {
          ApiService.post('/admin/pause-voting', {
            scope: 'global',
            paused: paused,
            incident_message: paused ? (vm.pauseForm.incident_message || 'Voting temporarily paused by operations.') : ''
          }).then(function () {
            ToastService.success(paused ? 'Global voting paused.' : 'Global voting resumed.');
            vm.load();
          }, function (err) { ToastService.error(err.message); });
        };

        vm.load();
      }
    ])
    .run(['$templateCache', function ($templateCache) {
      $templateCache.put('admin/dashboard.html', [
        '<div class="container portal-layout">',
        '  <th-admin-nav></th-admin-nav>',
        '  <div>',
        '    <div ng-if="vm.loading" class="loading-box">Loading platform KPIs...</div>',
        '    <div ng-if="vm.data">',
        '      <div class="flex-between mb-2"><h1 style="margin:0;font-size:1.55rem;">Platform Operations Overview</h1><button type="button" class="btn btn-sm btn-secondary" ng-click="vm.load()">&#8635; Refresh</button></div>',
        '      <div class="grid-4 mb-3">',
        '        <div class="kpi-card"><div class="kpi-label">Applications</div><div class="kpi-value">{{ vm.data.kpis.total_applications }}</div><div class="kpi-sub">{{ vm.data.kpis.pending_reviews }} awaiting review</div></div>',
        '        <div class="kpi-card"><div class="kpi-label">Active Nominees</div><div class="kpi-value">{{ vm.data.kpis.active_nominees }}</div><div class="kpi-sub">{{ vm.data.kpis.active_rounds_count }} open round(s)</div></div>',
        '        <div class="kpi-card"><div class="kpi-label">Ledger Valid Votes</div><div class="kpi-value">{{ vm.data.kpis.total_valid_votes | number }}</div><div class="kpi-sub">{{ vm.data.kpis.quarantined_payments }} quarantined tx</div></div>',
        '        <div class="kpi-card"><div class="kpi-label">Net Verified Collections</div><div class="kpi-value">{{ vm.data.kpis.net_collections_major | ghsCurrency:"GHS" }}</div><div class="kpi-sub">Refunds: {{ vm.data.kpis.refunded_major | ghsCurrency:"GHS" }}</div></div>',
        '      </div>',

        '      <div class="card mb-3" ng-if="vm.perms.canManageCompetition()">',
        '        <h3 style="margin-top:0;">Emergency Incident &amp; Voting Control</h3>',
        '        <div class="inline-actions" style="width:100%;">',
        '          <input type="text" class="form-control" style="flex:1;min-width:220px;" ng-model="vm.pauseForm.incident_message" placeholder="Incident banner text (optional)..." />',
        '          <button type="button" class="btn btn-danger" ng-click="vm.applyPause(true)">Pause Global Voting</button>',
        '          <button type="button" class="btn btn-success" ng-click="vm.applyPause(false)">Resume Voting</button>',
        '        </div>',
        '      </div>',

        '      <div class="card">',
        '        <div class="flex-between mb-2"><h3 style="margin:0;">Recent Audited Actions</h3><a ng-if="vm.perms.canFinance()" href="/admin/audit-logs" class="btn btn-sm btn-secondary">Full Audit Trail</a></div>',
        '        <div class="table-responsive">',
        '          <table class="data-table">',
        '            <thead><tr><th>Timestamp</th><th>Actor</th><th>Action</th><th>Entity</th></tr></thead>',
        '            <tbody>',
        '              <tr ng-repeat="a in vm.data.recent_audit_logs">',
        '                <td>{{ a.created_at | date:"short" }}</td>',
        '                <td>{{ a.actor_name }}</td>',
        '                <td><code>{{ a.action }}</code></td>',
        '                <td>{{ a.entity_type }} {{ a.entity_id | limitTo:12 }}</td>',
        '              </tr>',
        '            </tbody>',
        '          </table>',
        '        </div>',
        '      </div>',
        '    </div>',
        '  </div>',
        '</div>'
      ].join(''));
    }]);
})();
