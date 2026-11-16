(function () {
  'use strict';

  angular.module('talentHuntApp')
    .controller('AdminNomineesController', ['ApiService', 'PermissionsService', 'ToastService', 'AdminFilterUtils',
      function (ApiService, PermissionsService, ToastService, AdminFilterUtils) {
        var vm = this;
        vm.perms = PermissionsService;
        vm.items = [];
        vm.meta = {};
        vm.competitions = [];
        vm.categories = [];
        vm.filters = {
          q: '',
          competition_id: '',
          category_id: '',
          status: '',
          is_featured: '',
          voting_paused: '',
          sort: 'newest'
        };

        ApiService.get('/admin/competitions').then(function (res) { vm.competitions = res.data || []; });
        vm.loadCategories = function () {
          var params = vm.filters.competition_id ? { competition_id: vm.filters.competition_id } : {};
          ApiService.get('/admin/categories', params).then(function (res) { vm.categories = res.data || []; });
        };
        vm.loadCategories();

        vm.onCompetitionChange = function () {
          vm.filters.category_id = '';
          vm.loadCategories();
          vm.load(1);
        };

        vm.activeFilterCount = function () {
          var c = AdminFilterUtils.countActive(vm.filters, ['sort']);
          if (vm.filters.sort && vm.filters.sort !== 'newest') c++;
          return c;
        };

        vm.resetFilters = function () {
          vm.filters = {
            q: '',
            competition_id: '',
            category_id: '',
            status: '',
            is_featured: '',
            voting_paused: '',
            sort: 'newest'
          };
          vm.loadCategories();
          vm.load(1);
        };

        vm.load = function (page) {
          var params = AdminFilterUtils.cleanParams(vm.filters);
          params.page = page || 1;
          ApiService.get('/admin/nominees', params).then(function (res) {
            vm.items = res.data || [];
            vm.meta = res.meta || {};
          });
        };

        vm.toggleFeatured = function (n) {
          ApiService.patch('/admin/nominees/' + n.id, { is_featured: !n.is_featured }).then(function () {
            vm.load(vm.meta.page);
          });
        };

        vm.togglePause = function (n) {
          ApiService.patch('/admin/nominees/' + n.id, { voting_paused: !n.voting_paused }).then(function () {
            ToastService.info('Nominee voting pause updated.');
            vm.load(vm.meta.page);
          });
        };

        vm.reissueLink = function (n) {
          var reason = window.prompt('Enter audit reason for reissuing voting link:');
          if (!reason) return;
          ApiService.post('/admin/nominees/' + n.id + '/voting-link', { action: 'reissue', reason: reason }).then(function () {
            ToastService.success('New unique voting link issued and audited.');
            vm.load(vm.meta.page);
          }, function (err) { ToastService.error(err.message); });
        };

        vm.disqualify = function (n) {
          var reason = window.prompt('Enter documented reason for disqualifying ' + n.public_name + ':');
          if (!reason) return;
          ApiService.patch('/admin/nominees/' + n.id, { status: 'DISQUALIFIED', reason: reason }).then(function () {
            ToastService.success(n.public_name + ' marked DISQUALIFIED.');
            vm.load(vm.meta.page);
          }, function (err) { ToastService.error(err.message); });
        };

        vm.load(1);
      }
    ])
    .run(['$templateCache', function ($templateCache) {
      $templateCache.put('admin/nominees.html', [
        '<div class="container portal-layout">',
        '  <th-admin-nav></th-admin-nav>',
        '  <div class="card">',
        '    <div class="flex-between mb-2">',
        '      <h1 style="margin:0;font-size:1.5rem;">Nominee &amp; Voting Link Management</h1>',
        '      <button type="button" class="btn btn-sm btn-secondary" ng-click="vm.load(vm.meta.page || 1)"><th-icon name="refresh" size="14"></th-icon><span>Refresh</span></button>',
        '    </div>',

        '    <div class="filter-bar">',
        '      <div class="filter-bar-top">',
        '        <span class="filter-bar-title"><th-icon name="filter" size="14"></th-icon><span>Filter Nominees</span></span>',
        '        <div class="inline-actions">',
        '          <span class="filter-count-pill">{{ vm.meta.total !== undefined ? vm.meta.total : vm.items.length }} nominee(s)</span>',
        '          <button type="button" class="btn btn-sm btn-secondary" ng-if="vm.activeFilterCount() > 0" ng-click="vm.resetFilters()"><th-icon name="rotate-ccw" size="14"></th-icon><span>Reset</span></button>',
        '        </div>',
        '      </div>',
        '      <div class="filter-bar-grid">',
        '        <div class="filter-field-search">',
        '          <label class="filter-label">Search Nominees</label>',
        '          <div class="search-input-wrap">',
        '            <th-icon name="search" size="15"></th-icon>',
        '            <input type="text" class="form-control form-control-sm" ng-model="vm.filters.q" ng-model-options="{ debounce: 250 }" ng-change="vm.load(1)" placeholder="Name, slug, voting link, location..." />',
        '          </div>',
        '        </div>',
        '        <div class="filter-field">',
        '          <label class="filter-label">Competition</label>',
        '          <select class="form-control form-control-sm" ng-model="vm.filters.competition_id" ng-change="vm.onCompetitionChange()">',
        '            <option value="">All Competitions</option>',
        '            <option ng-repeat="c in vm.competitions" value="{{ c.id }}">{{ c.title }}</option>',
        '          </select>',
        '        </div>',
        '        <div class="filter-field">',
        '          <label class="filter-label">Category</label>',
        '          <select class="form-control form-control-sm" ng-model="vm.filters.category_id" ng-change="vm.load(1)">',
        '            <option value="">All Categories</option>',
        '            <option ng-repeat="cat in vm.categories" value="{{ cat.id }}">{{ cat.name }}</option>',
        '          </select>',
        '        </div>',
        '        <div class="filter-field">',
        '          <label class="filter-label">Status</label>',
        '          <select class="form-control form-control-sm" ng-model="vm.filters.status" ng-change="vm.load(1)">',
        '            <option value="">All Statuses</option>',
        '            <option value="ACTIVE">ACTIVE</option>',
        '            <option value="QUALIFIED">QUALIFIED</option>',
        '            <option value="WINNER">WINNER</option>',
        '            <option value="ELIMINATED">ELIMINATED</option>',
        '            <option value="DISQUALIFIED">DISQUALIFIED</option>',
        '            <option value="PENDING">PENDING</option>',
        '            <option value="SUSPENDED">SUSPENDED</option>',
        '          </select>',
        '        </div>',
        '        <div class="filter-field">',
        '          <label class="filter-label">Featured</label>',
        '          <select class="form-control form-control-sm" ng-model="vm.filters.is_featured" ng-change="vm.load(1)">',
        '            <option value="">All</option>',
        '            <option value="true">Featured Only</option>',
        '            <option value="false">Not Featured</option>',
        '          </select>',
        '        </div>',
        '        <div class="filter-field">',
        '          <label class="filter-label">Voting State</label>',
        '          <select class="form-control form-control-sm" ng-model="vm.filters.voting_paused" ng-change="vm.load(1)">',
        '            <option value="">All</option>',
        '            <option value="false">Active Voting</option>',
        '            <option value="true">Voting Paused</option>',
        '          </select>',
        '        </div>',
        '        <div class="filter-field">',
        '          <label class="filter-label">Sort By</label>',
        '          <select class="form-control form-control-sm" ng-model="vm.filters.sort" ng-change="vm.load(1)">',
        '            <option value="newest">Newest Nominated</option>',
        '            <option value="votes_desc">Most Total Votes</option>',
        '            <option value="name_asc">Name (A-Z)</option>',
        '          </select>',
        '        </div>',
        '      </div>',
        '    </div>',

        '    <div ng-if="!vm.items.length" class="empty-state">No nominees match the selected filters.</div>',
        '    <div class="table-responsive" ng-if="vm.items.length">',
        '      <table class="data-table">',
        '        <thead><tr><th>Nominee</th><th>Category</th><th>Active Voting Slug</th><th>Round Votes</th><th>Status</th><th>Controls</th></tr></thead>',
        '        <tbody>',
        '          <tr ng-repeat="n in vm.items">',
        '            <td><a ng-href="/nominee/{{ n.public_slug }}"><strong>{{ n.public_name }}</strong></a><div class="muted" style="font-size:0.78rem;">Featured: {{ n.is_featured ? "Yes" : "No" }}</div></td>',
        '            <td>{{ n.category_name }}</td>',
        '            <td><code>{{ n.voting_slug }}</code></td>',
        '            <td><strong>{{ n.current_round_votes | number }}</strong> <span class="muted">({{ n.total_votes | number }} total)</span></td>',
        '            <td><th-status-badge status="n.status"></th-status-badge><span ng-if="n.voting_paused" class="status-badge badge-danger" style="margin-left:4px;">PAUSED</span></td>',
        '            <td class="inline-actions" ng-if="vm.perms.canManageCompetition()">',
        '              <button type="button" class="btn btn-sm btn-secondary" ng-click="vm.toggleFeatured(n)">{{ n.is_featured ? "Unfeature" : "Feature" }}</button>',
        '              <button type="button" class="btn btn-sm btn-secondary" ng-click="vm.togglePause(n)">{{ n.voting_paused ? "Resume" : "Pause" }}</button>',
        '              <button type="button" class="btn btn-sm btn-secondary" ng-click="vm.reissueLink(n)">Reissue Link</button>',
        '              <button ng-if="n.status !== \'DISQUALIFIED\'" type="button" class="btn btn-sm btn-danger" ng-click="vm.disqualify(n)">Disqualify</button>',
        '            </td>',
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
