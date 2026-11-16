(function () {
  'use strict';

  var REPORT_STATUS_OPTIONS = {
    finance: ['PAID', 'PENDING_PAYMENT', 'QUARANTINED', 'REFUNDED', 'FAILED'],
    votes: ['CREDIT', 'REVERSAL', 'ADJUSTMENT'],
    applications: ['SUBMITTED', 'UNDER_REVIEW', 'CHANGES_REQUESTED', 'APPROVED', 'NOMINATED', 'REJECTED'],
    nominees: ['ACTIVE', 'QUALIFIED', 'WINNER', 'ELIMINATED', 'DISQUALIFIED'],
    eliminations: ['QUALIFIED', 'WINNER', 'ELIMINATED', 'DISQUALIFIED'],
    sponsors_partners: ['ACTIVE', 'DRAFT', 'ARCHIVED'],
    partnership_inquiries: ['NEW', 'UNDER_REVIEW', 'CONTACTED', 'APPROVED', 'DECLINED']
  };

  angular.module('talentHuntApp')
    .controller('AdminReportsController', ['ApiService', 'PermissionsService', 'ToastService', 'AdminFilterUtils',
      function (ApiService, PermissionsService, ToastService, AdminFilterUtils) {
        var vm = this;
        vm.perms = PermissionsService;
        vm.reportType = 'finance';
        vm.reportData = null;
        vm.competitions = [];
        vm.rounds = [];
        vm.filters = {
          q: '',
          competition_id: '',
          round_id: '',
          status: '',
          date_from: null,
          date_to: null
        };

        ApiService.get('/admin/competitions').then(function (res) { vm.competitions = res.data || []; });
        vm.loadRounds = function () {
          var p = vm.filters.competition_id ? { competition_id: vm.filters.competition_id } : {};
          ApiService.get('/admin/rounds', p).then(function (res) { vm.rounds = res.data || []; });
        };
        vm.loadRounds();

        vm.statusOptions = function () {
          return REPORT_STATUS_OPTIONS[vm.reportType] || [];
        };

        vm.supportsRoundFilter = function () {
          return vm.reportType === 'finance' || vm.reportType === 'votes' || vm.reportType === 'eliminations';
        };

        vm.onReportTypeChange = function () {
          vm.filters.status = '';
          if (!vm.supportsRoundFilter()) vm.filters.round_id = '';
          vm.load();
        };

        vm.onCompetitionChange = function () {
          vm.filters.round_id = '';
          vm.loadRounds();
          vm.load();
        };

        vm.activeFilterCount = function () {
          return AdminFilterUtils.countActive(vm.filters);
        };

        vm.resetFilters = function () {
          vm.filters = { q: '', competition_id: '', round_id: '', status: '', date_from: null, date_to: null };
          vm.loadRounds();
          vm.load();
        };

        vm.load = function () {
          var params = AdminFilterUtils.cleanParams(vm.filters);
          ApiService.get('/admin/reports/' + vm.reportType, params).then(function (res) {
            vm.reportData = res.data;
          }, function (err) { ToastService.error(err.message); });
        };

        vm.csvUrl = function () {
          var params = AdminFilterUtils.cleanParams(vm.filters);
          params.format = 'csv';
          var parts = [];
          angular.forEach(params, function (val, key) {
            parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(val));
          });
          return '/api/v1/admin/reports/' + vm.reportType + '?' + parts.join('&');
        };

        vm.load();
      }
    ])
    .controller('AdminAuditLogsController', ['ApiService', 'AdminFilterUtils',
      function (ApiService, AdminFilterUtils) {
        var vm = this;
        vm.logs = [];
        vm.meta = {};
        vm.filters = {
          q: '',
          entity_type: '',
          action: '',
          date_from: null,
          date_to: null
        };

        vm.activeFilterCount = function () {
          return AdminFilterUtils.countActive(vm.filters);
        };

        vm.resetFilters = function () {
          vm.filters = { q: '', entity_type: '', action: '', date_from: null, date_to: null };
          vm.load(1);
        };

        vm.load = function (page) {
          var params = AdminFilterUtils.cleanParams(vm.filters);
          params.page = page || 1;
          ApiService.get('/admin/audit-logs', params).then(function (res) {
            vm.logs = res.data || [];
            vm.meta = res.meta || {};
          });
        };

        vm.load(1);
      }
    ])
    .run(['$templateCache', function ($templateCache) {
      $templateCache.put('admin/reports.html', [
        '<div class="container portal-layout">',
        '  <th-admin-nav></th-admin-nav>',
        '  <div class="card">',
        '    <div class="flex-between mb-2">',
        '      <h1 style="margin:0;font-size:1.5rem;">Operational &amp; Finance Reports</h1>',
        '      <div class="inline-actions">',
        '        <select class="form-control" style="width:220px;" ng-model="vm.reportType" ng-change="vm.onReportTypeChange()">',
        '          <option value="finance">Finance &amp; Collections</option>',
        '          <option value="votes">Vote Ledger Export</option>',
        '          <option ng-if="vm.perms.canManageCompetition()" value="applications">Applications</option>',
        '          <option ng-if="vm.perms.canManageCompetition()" value="nominees">Nominees</option>',
        '          <option ng-if="vm.perms.canManageCompetition()" value="eliminations">Elimination Snapshots</option>',
        '          <option ng-if="vm.perms.canManageCompetition()" value="sponsors_partners">Sponsors &amp; Partners</option>',
        '          <option ng-if="vm.perms.canManageCompetition()" value="partnership_inquiries">Partnership Inquiries</option>',
        '        </select>',
        '        <a ng-href="{{ vm.csvUrl() }}" target="_blank" class="btn btn-primary"><th-icon name="download" size="15"></th-icon><span>Export CSV</span></a>',
        '      </div>',
        '    </div>',

        '    <div class="filter-bar">',
        '      <div class="filter-bar-top">',
        '        <span class="filter-bar-title"><th-icon name="filter" size="14"></th-icon><span>Filter Report Data &amp; CSV Export</span></span>',
        '        <div class="inline-actions">',
        '          <span class="filter-count-pill" ng-if="vm.reportData && vm.reportData.summary">{{ vm.reportData.summary.row_count }} row(s)</span>',
        '          <button type="button" class="btn btn-sm btn-secondary" ng-if="vm.activeFilterCount() > 0" ng-click="vm.resetFilters()"><th-icon name="rotate-ccw" size="14"></th-icon><span>Reset</span></button>',
        '        </div>',
        '      </div>',
        '      <div class="filter-bar-grid">',
        '        <div class="filter-field-search">',
        '          <label class="filter-label">Search Rows</label>',
        '          <div class="search-input-wrap">',
        '            <th-icon name="search" size="15"></th-icon>',
        '            <input type="text" class="form-control form-control-sm" ng-model="vm.filters.q" ng-model-options="{ debounce: 250 }" ng-change="vm.load()" placeholder="Filter by reference, nominee, keyword..." />',
        '          </div>',
        '        </div>',
        '        <div class="filter-field">',
        '          <label class="filter-label">Competition</label>',
        '          <select class="form-control form-control-sm" ng-model="vm.filters.competition_id" ng-change="vm.onCompetitionChange()">',
        '            <option value="">All Competitions</option>',
        '            <option ng-repeat="c in vm.competitions" value="{{ c.id }}">{{ c.title }}</option>',
        '          </select>',
        '        </div>',
        '        <div class="filter-field" ng-if="vm.supportsRoundFilter()">',
        '          <label class="filter-label">Round</label>',
        '          <select class="form-control form-control-sm" ng-model="vm.filters.round_id" ng-change="vm.load()">',
        '            <option value="">All Rounds</option>',
        '            <option ng-repeat="r in vm.rounds" value="{{ r.id }}">{{ r.name }}</option>',
        '          </select>',
        '        </div>',
        '        <div class="filter-field">',
        '          <label class="filter-label">Status / Type</label>',
        '          <select class="form-control form-control-sm" ng-model="vm.filters.status" ng-change="vm.load()">',
        '            <option value="">All</option>',
        '            <option ng-repeat="st in vm.statusOptions()" value="{{ st }}">{{ st }}</option>',
        '          </select>',
        '        </div>',
        '        <div class="filter-field-date">',
        '          <label class="filter-label">From Date</label>',
        '          <input type="date" class="form-control form-control-sm" ng-model="vm.filters.date_from" ng-change="vm.load()" />',
        '        </div>',
        '        <div class="filter-field-date">',
        '          <label class="filter-label">To Date</label>',
        '          <input type="date" class="form-control form-control-sm" ng-model="vm.filters.date_to" ng-change="vm.load()" />',
        '        </div>',
        '      </div>',
        '    </div>',

        '    <div class="alert alert-info" ng-if="vm.reportData && vm.reportData.summary">',
        '      Rows: <strong>{{ vm.reportData.summary.row_count }}</strong>',
        '      <span ng-if="vm.reportData.summary.net_collections_ghs !== undefined"> &bull; Gross: <strong>GHS {{ vm.reportData.summary.gross_collections_ghs | number:2 }}</strong> &bull; Refunds: <strong>GHS {{ vm.reportData.summary.refunds_ghs | number:2 }}</strong> &bull; Net: <strong>GHS {{ vm.reportData.summary.net_collections_ghs | number:2 }}</strong></span>',
        '    </div>',
        '    <div ng-if="vm.reportData && !vm.reportData.rows.length" class="empty-state">No report records match the selected filters.</div>',
        '    <div class="table-responsive" ng-if="vm.reportData && vm.reportData.rows.length">',
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
        '      <button type="button" class="btn btn-sm btn-secondary" ng-click="vm.load(vm.meta.page || 1)"><th-icon name="refresh" size="14"></th-icon><span>Refresh</span></button>',
        '    </div>',

        '    <div class="filter-bar">',
        '      <div class="filter-bar-top">',
        '        <span class="filter-bar-title"><th-icon name="filter" size="14"></th-icon><span>Filter Audit Trail</span></span>',
        '        <div class="inline-actions">',
        '          <span class="filter-count-pill">{{ vm.meta.total !== undefined ? vm.meta.total : vm.logs.length }} record(s)</span>',
        '          <button type="button" class="btn btn-sm btn-secondary" ng-if="vm.activeFilterCount() > 0" ng-click="vm.resetFilters()"><th-icon name="rotate-ccw" size="14"></th-icon><span>Reset</span></button>',
        '        </div>',
        '      </div>',
        '      <div class="filter-bar-grid">',
        '        <div class="filter-field-search">',
        '          <label class="filter-label">Search</label>',
        '          <div class="search-input-wrap">',
        '            <th-icon name="search" size="15"></th-icon>',
        '            <input type="text" class="form-control form-control-sm" ng-model="vm.filters.q" ng-model-options="{ debounce: 250 }" ng-change="vm.load(1)" placeholder="Actor name, action code, entity ID..." />',
        '          </div>',
        '        </div>',
        '        <div class="filter-field">',
        '          <label class="filter-label">Entity Type</label>',
        '          <select class="form-control form-control-sm" ng-model="vm.filters.entity_type" ng-change="vm.load(1)">',
        '            <option value="">All Entities</option>',
        '            <option value="competition">competition</option>',
        '            <option value="category">category</option>',
        '            <option value="round">round</option>',
        '            <option value="vote_package">vote_package</option>',
        '            <option value="application">application</option>',
        '            <option value="nominee">nominee</option>',
        '            <option value="sponsor">sponsor</option>',
        '            <option value="partner">partner</option>',
        '            <option value="partnership_inquiry">partnership_inquiry</option>',
        '            <option value="order">order</option>',
        '            <option value="payment">payment</option>',
        '            <option value="vote_ledger">vote_ledger</option>',
        '            <option value="moderation_report">moderation_report</option>',
        '            <option value="support_ticket">support_ticket</option>',
        '            <option value="user">user</option>',
        '            <option value="settings">settings</option>',
        '            <option value="report">report</option>',
        '          </select>',
        '        </div>',
        '        <div class="filter-field">',
        '          <label class="filter-label">Action Keyword</label>',
        '          <input type="text" class="form-control form-control-sm" ng-model="vm.filters.action" ng-model-options="{ debounce: 250 }" ng-change="vm.load(1)" placeholder="e.g. UPDATED, CREATED..." />',
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

        '    <div ng-if="!vm.logs.length" class="empty-state">No audit log entries match the selected filters.</div>',
        '    <div class="table-responsive" ng-if="vm.logs.length">',
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
