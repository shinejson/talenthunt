(function () {
  'use strict';

  angular.module('talentHuntApp')
    .controller('AdminReportsController', ['ApiService', 'PermissionsService', 'ToastService',
      function (ApiService, PermissionsService, ToastService) {
        var vm = this;
        vm.perms = PermissionsService;
        vm.reportType = 'finance';
        vm.reportData = null;

        vm.load = function () {
          ApiService.get('/admin/reports/' + vm.reportType).then(function (res) {
            vm.reportData = res.data;
          }, function (err) { ToastService.error(err.message); });
        };

        vm.csvUrl = function () {
          return '/api/v1/admin/reports/' + vm.reportType + '?format=csv';
        };

        vm.load();
      }
    ])
    .controller('AdminAuditLogsController', ['ApiService', function (ApiService) {
      var vm = this;
      vm.logs = [];
      vm.meta = {};
      vm.entityType = '';

      vm.load = function (page) {
        ApiService.get('/admin/audit-logs', { entity_type: vm.entityType, page: page || 1 }).then(function (res) {
          vm.logs = res.data || [];
          vm.meta = res.meta || {};
        });
      };

      vm.load(1);
    }])
    .run(['$templateCache', function ($templateCache) {
      $templateCache.put('admin/reports.html', [
        '<div class="container portal-layout">',
        '  <th-admin-nav></th-admin-nav>',
        '  <div class="card">',
        '    <div class="flex-between mb-2">',
        '      <h1 style="margin:0;font-size:1.5rem;">Operational &amp; Finance Reports</h1>',
        '      <div class="inline-actions">',
        '        <select class="form-control" style="width:210px;" ng-model="vm.reportType" ng-change="vm.load()">',
        '          <option value="finance">Finance &amp; Collections</option>',
        '          <option value="votes">Vote Ledger Export</option>',
        '          <option ng-if="vm.perms.canManageCompetition()" value="applications">Applications</option>',
        '          <option ng-if="vm.perms.canManageCompetition()" value="nominees">Nominees</option>',
        '          <option ng-if="vm.perms.canManageCompetition()" value="eliminations">Elimination Snapshots</option>',
        '        </select>',
        '        <a ng-href="{{ vm.csvUrl() }}" target="_blank" class="btn btn-primary">&#8681; Export CSV</a>',
        '      </div>',
        '    </div>',
        '    <div class="alert alert-info" ng-if="vm.reportData && vm.reportData.summary">',
        '      Rows: <strong>{{ vm.reportData.summary.row_count }}</strong>',
        '      <span ng-if="vm.reportData.summary.net_collections_ghs !== undefined"> &bull; Gross: <strong>GHS {{ vm.reportData.summary.gross_collections_ghs | number:2 }}</strong> &bull; Refunds: <strong>GHS {{ vm.reportData.summary.refunds_ghs | number:2 }}</strong> &bull; Net: <strong>GHS {{ vm.reportData.summary.net_collections_ghs | number:2 }}</strong></span>',
        '    </div>',
        '    <div class="table-responsive" ng-if="vm.reportData">',
        '      <table class="data-table">',
        '        <thead><tr><th ng-repeat="col in vm.reportData.columns">{{ col }}</th></tr></thead>',
        '        <tbody><tr ng-repeat="r in vm.reportData.rows | limitTo:50"><td ng-repeat="col in vm.reportData.columns">{{ r[col] }}</td></tr></tbody>',
        '      </table>',
        '    </div>',
        '  </div>',
        '</div>'
      ].join(''));

      $templateCache.put('admin/audit-logs.html', [
        '<div class="container portal-layout">',
        '  <th-admin-nav></th-admin-nav>',
        '  <div class="card">',
        '    <div class="flex-between mb-2">',
        '      <h1 style="margin:0;font-size:1.5rem;">Immutable Audit Trail</h1>',
        '      <select class="form-control" style="width:190px;" ng-model="vm.entityType" ng-change="vm.load(1)">',
        '        <option value="">All Entities</option><option value="application">application</option><option value="nominee">nominee</option><option value="order">order</option><option value="payment">payment</option><option value="vote_ledger">vote_ledger</option><option value="round">round</option><option value="user">user</option>',
        '      </select>',
        '    </div>',
        '    <div class="table-responsive">',
        '      <table class="data-table">',
        '        <thead><tr><th>Timestamp</th><th>Actor</th><th>Action</th><th>Entity</th><th>Details</th></tr></thead>',
        '        <tbody>',
        '          <tr ng-repeat="a in vm.logs">',
        '            <td>{{ a.created_at | date:"short" }}</td>',
        '            <td>{{ a.actor_name }}</td>',
        '            <td><code>{{ a.action }}</code></td>',
        '            <td>{{ a.entity_type }} ({{ a.entity_id | limitTo:10 }})</td>',
        '            <td style="font-size:0.78rem;font-family:monospace;">{{ a.after_json ? (a.after_json | json) : "-" }}</td>',
        '          </tr>',
        '        </tbody>',
        '      </table>',
        '    </div>',
        '    <th-pagination meta="vm.meta" on-page="vm.load(page)"></th-pagination>',
        '  </div>',
        '</div>'
      ].join(''));
    }]);
})();
