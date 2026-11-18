(function () {
  'use strict';

  angular.module('talentHuntApp')
    .controller('AdminCompetitionsController', ['ApiService', 'ToastService', 'AdminFilterUtils',
      function (ApiService, ToastService, AdminFilterUtils) {
        var vm = this;
        vm.competitions = [];
        vm.showCreate = false;
        vm.filters = {
          q: '',
          status: '',
          voting_paused: '',
          public_leaderboard: ''
        };
        vm.newComp = {
          title: '', tagline: '', description: '', status: 'APPLICATIONS_OPEN',
          currency: 'GHS', timezone: 'Africa/Accra', unit_vote_price_minor: 100,
          application_fee_major: 50.0,
          public_leaderboard: true, nominee_see_rank: true, prize_summary: '', rules: ''
        };

        vm.activeFilterCount = function () {
          return AdminFilterUtils.countActive(vm.filters);
        };

        vm.resetFilters = function () {
          vm.filters = { q: '', status: '', voting_paused: '', public_leaderboard: '' };
          vm.load();
        };

        vm.load = function () {
          ApiService.get('/admin/competitions', AdminFilterUtils.cleanParams(vm.filters)).then(function (res) {
            vm.competitions = res.data || [];
          });
        };

        vm.create = function () {
          ApiService.post('/admin/competitions', vm.newComp).then(function () {
            ToastService.success('Competition created.');
            vm.showCreate = false;
            vm.load();
          }, function (err) { ToastService.error(err.message); });
        };

        vm.saveComp = function (c) {
          ApiService.patch('/admin/competitions/' + c.id, {
            title: c.title,
            tagline: c.tagline,
            status: c.status,
            public_leaderboard: c.public_leaderboard,
            nominee_see_rank: c.nominee_see_rank,
            voting_paused: c.voting_paused,
            application_fee_major: c.application_fee_major,
            unit_vote_price_minor: c.unit_vote_price_minor,
            max_vote_quantity_per_order: c.max_vote_quantity_per_order,
            rules: c.rules
          }).then(function () {
            ToastService.success('Competition updated.');
            vm.load();
          }, function (err) { ToastService.error(err.message); });
        };

        vm.load();
      }
    ])
    .controller('AdminCategoriesController', ['ApiService', 'ToastService', 'AdminFilterUtils',
      function (ApiService, ToastService, AdminFilterUtils) {
        var vm = this;
        vm.competitions = [];
        vm.compMap = {};
        vm.categories = [];
        vm.selectedCompId = '';
        vm.filters = {
          competition_id: '',
          status: '',
          q: ''
        };
        vm.newCat = { name: '', description: '' };

        ApiService.get('/admin/competitions').then(function (res) {
          vm.competitions = res.data || [];
          vm.compMap = {};
          for (var i = 0; i < vm.competitions.length; i++) {
            vm.compMap[vm.competitions[i].id] = vm.competitions[i].title;
          }
          if (vm.competitions.length) {
            vm.selectedCompId = vm.competitions[0].id;
            vm.filters.competition_id = vm.competitions[0].id;
          }
          vm.loadCategories();
        });

        vm.activeFilterCount = function () {
          return AdminFilterUtils.countActive(vm.filters, ['competition_id']);
        };

        vm.resetFilters = function () {
          vm.filters.status = '';
          vm.filters.q = '';
          vm.filters.competition_id = vm.competitions.length ? vm.competitions[0].id : '';
          vm.selectedCompId = vm.filters.competition_id || (vm.competitions[0] && vm.competitions[0].id) || '';
          vm.loadCategories();
        };

        vm.onCompFilterChange = function () {
          if (vm.filters.competition_id) {
            vm.selectedCompId = vm.filters.competition_id;
          }
          vm.loadCategories();
        };

        vm.loadCategories = function () {
          ApiService.get('/admin/categories', AdminFilterUtils.cleanParams(vm.filters)).then(function (res) {
            vm.categories = res.data || [];
          });
        };

        vm.createCategory = function () {
          var targetCompId = vm.filters.competition_id || vm.selectedCompId;
          if (!targetCompId) {
            ToastService.error('Please select a competition first.');
            return;
          }
          ApiService.post('/admin/categories', {
            competition_id: targetCompId,
            name: vm.newCat.name,
            description: vm.newCat.description
          }).then(function () {
            vm.newCat = { name: '', description: '' };
            ToastService.success('Category added.');
            vm.loadCategories();
          }, function (err) { ToastService.error(err.message); });
        };

        vm.toggleStatus = function (cat) {
          var next = cat.status === 'ACTIVE' ? 'ARCHIVED' : 'ACTIVE';
          ApiService.patch('/admin/categories/' + cat.id, { status: next }).then(function () {
            vm.loadCategories();
          });
        };
      }
    ])
    .run(['$templateCache', function ($templateCache) {
      $templateCache.put('admin/competitions.html', [
        '<div class="container portal-layout">',
        '  <th-admin-nav></th-admin-nav>',
        '  <div>',
        '    <div class="flex-between mb-2">',
        '      <h1 style="margin:0;font-size:1.5rem;">Competition Management</h1>',
        '      <button type="button" class="btn btn-primary" ng-click="vm.showCreate = !vm.showCreate"><th-icon name="{{ vm.showCreate ? \'x\' : \'plus\' }}" size="15"></th-icon><span>{{ vm.showCreate ? "Cancel" : "New Competition" }}</span></button>',
        '    </div>',

        '    <div class="filter-bar">',
        '      <div class="filter-bar-top">',
        '        <span class="filter-bar-title"><th-icon name="filter" size="14"></th-icon><span>Filter Competitions</span></span>',
        '        <div class="inline-actions">',
        '          <span class="filter-count-pill">{{ vm.competitions.length }} competition(s)</span>',
        '          <button type="button" class="btn btn-sm btn-secondary" ng-if="vm.activeFilterCount() > 0" ng-click="vm.resetFilters()"><th-icon name="rotate-ccw" size="14"></th-icon><span>Reset</span></button>',
        '        </div>',
        '      </div>',
        '      <div class="filter-bar-grid">',
        '        <div class="filter-field-search">',
        '          <label class="filter-label">Search</label>',
        '          <div class="search-input-wrap">',
        '            <th-icon name="search" size="15"></th-icon>',
        '            <input type="text" class="form-control form-control-sm" ng-model="vm.filters.q" ng-model-options="{ debounce: 250 }" ng-change="vm.load()" placeholder="Search title, slug, tagline, prize..." />',
        '          </div>',
        '        </div>',
        '        <div class="filter-field">',
        '          <label class="filter-label">Status</label>',
        '          <select class="form-control form-control-sm" ng-model="vm.filters.status" ng-change="vm.load()">',
        '            <option value="">All Statuses</option>',
        '            <option value="DRAFT">DRAFT</option>',
        '            <option value="PUBLISHED">PUBLISHED</option>',
        '            <option value="APPLICATIONS_OPEN">APPLICATIONS_OPEN</option>',
        '            <option value="REVIEW">REVIEW</option>',
        '            <option value="VOTING">VOTING</option>',
        '            <option value="RESULTS_PENDING">RESULTS_PENDING</option>',
        '            <option value="COMPLETED">COMPLETED</option>',
        '            <option value="ARCHIVED">ARCHIVED</option>',
        '          </select>',
        '        </div>',
        '        <div class="filter-field">',
        '          <label class="filter-label">Voting State</label>',
        '          <select class="form-control form-control-sm" ng-model="vm.filters.voting_paused" ng-change="vm.load()">',
        '            <option value="">All States</option>',
        '            <option value="false">Voting Active</option>',
        '            <option value="true">Voting Paused</option>',
        '          </select>',
        '        </div>',
        '        <div class="filter-field">',
        '          <label class="filter-label">Leaderboard</label>',
        '          <select class="form-control form-control-sm" ng-model="vm.filters.public_leaderboard" ng-change="vm.load()">',
        '            <option value="">All Visibility</option>',
        '            <option value="true">Public Leaderboard</option>',
        '            <option value="false">Hidden Leaderboard</option>',
        '          </select>',
        '        </div>',
        '      </div>',
        '    </div>',

        '    <form class="card mb-3" ng-if="vm.showCreate" ng-submit="vm.create()">',
        '      <h3>Create Competition</h3>',
        '      <div class="grid-2">',
        '        <div class="form-group"><label class="form-label">Title *</label><input type="text" class="form-control" ng-model="vm.newComp.title" required /></div>',
        '        <div class="form-group"><label class="form-label">Status</label><select class="form-control" ng-model="vm.newComp.status"><option value="DRAFT">DRAFT</option><option value="PUBLISHED">PUBLISHED</option><option value="APPLICATIONS_OPEN">APPLICATIONS_OPEN</option><option value="VOTING">VOTING</option></select></div>',
        '      </div>',
        '      <div class="form-group"><label class="form-label">Tagline</label><input type="text" class="form-control" ng-model="vm.newComp.tagline" /></div>',
        '      <div class="grid-3">',
        '        <div class="form-group"><label class="form-label">Application Fee (GHS)</label><input type="number" step="0.5" min="0" class="form-control" ng-model="vm.newComp.application_fee_major" placeholder="50.00" /></div>',
        '        <div class="form-group"><label class="form-label">Unit Vote Price (Pesewas, 100 = GHS 1.00)</label><input type="number" class="form-control" ng-model="vm.newComp.unit_vote_price_minor" /></div>',
        '        <div class="form-group"><label class="form-label">Prize Summary</label><input type="text" class="form-control" ng-model="vm.newComp.prize_summary" /></div>',
        '      </div>',
        '      <div class="form-group"><label class="form-label">Official Rules</label><textarea class="form-control" ng-model="vm.newComp.rules"></textarea></div>',
        '      <button type="submit" class="btn btn-primary">Create Competition</button>',
        '    </form>',

        '    <div ng-if="!vm.competitions.length" class="card empty-state">No competitions match the selected filters.</div>',
        '    <div class="card mb-2" ng-repeat="c in vm.competitions">',
        '      <div class="flex-between mb-2"><strong>{{ c.title }} (<code>{{ c.slug }}</code>)</strong><th-status-badge status="c.status"></th-status-badge></div>',
        '      <div class="grid-4">',
        '        <div class="form-group"><label class="form-label">Status</label><select class="form-control" ng-model="c.status"><option value="DRAFT">DRAFT</option><option value="PUBLISHED">PUBLISHED</option><option value="APPLICATIONS_OPEN">APPLICATIONS_OPEN</option><option value="REVIEW">REVIEW</option><option value="VOTING">VOTING</option><option value="RESULTS_PENDING">RESULTS_PENDING</option><option value="COMPLETED">COMPLETED</option></select></div>',
        '        <div class="form-group"><label class="form-label">App Fee (GHS)</label><input type="number" step="0.5" min="0" class="form-control" ng-model="c.application_fee_major" /></div>',
        '        <div class="form-group"><label class="form-label">Vote Price (Minor / Pesewas)</label><input type="number" class="form-control" ng-model="c.unit_vote_price_minor" /></div>',
        '        <div class="form-group"><label class="form-label">Max Votes / Order</label><input type="number" class="form-control" ng-model="c.max_vote_quantity_per_order" /></div>',
        '      </div>',
        '      <div class="inline-actions mb-2">',
        '        <label><input type="checkbox" ng-model="c.public_leaderboard" /> Public Leaderboard</label>',
        '        <label><input type="checkbox" ng-model="c.nominee_see_rank" /> Nominee Sees Rank</label>',
        '        <label><input type="checkbox" ng-model="c.voting_paused" /> Pause Competition Voting</label>',
        '      </div>',
        '      <button type="button" class="btn btn-sm btn-primary" ng-click="vm.saveComp(c)">Save Changes</button>',
        '    </div>',
        '  </div>',
        '</div>'
      ].join(''));

      $templateCache.put('admin/categories.html', [
        '<div class="container portal-layout">',
        '  <th-admin-nav></th-admin-nav>',
        '  <div class="card">',
        '    <h1 style="margin-top:0;font-size:1.5rem;">Category Management</h1>',

        '    <div class="filter-bar">',
        '      <div class="filter-bar-top">',
        '        <span class="filter-bar-title"><th-icon name="filter" size="14"></th-icon><span>Filter Categories</span></span>',
        '        <div class="inline-actions">',
        '          <span class="filter-count-pill">{{ vm.categories.length }} category(s)</span>',
        '          <button type="button" class="btn btn-sm btn-secondary" ng-if="vm.activeFilterCount() > 0 || !vm.filters.competition_id" ng-click="vm.resetFilters()"><th-icon name="rotate-ccw" size="14"></th-icon><span>Reset</span></button>',
        '        </div>',
        '      </div>',
        '      <div class="filter-bar-grid">',
        '        <div class="filter-field">',
        '          <label class="filter-label">Competition</label>',
        '          <select class="form-control form-control-sm" ng-model="vm.filters.competition_id" ng-change="vm.onCompFilterChange()">',
        '            <option value="">All Competitions</option>',
        '            <option ng-repeat="c in vm.competitions" value="{{ c.id }}">{{ c.title }}</option>',
        '          </select>',
        '        </div>',
        '        <div class="filter-field-search">',
        '          <label class="filter-label">Search Categories</label>',
        '          <div class="search-input-wrap">',
        '            <th-icon name="search" size="15"></th-icon>',
        '            <input type="text" class="form-control form-control-sm" ng-model="vm.filters.q" ng-model-options="{ debounce: 250 }" ng-change="vm.loadCategories()" placeholder="Search category name, slug, description..." />',
        '          </div>',
        '        </div>',
        '        <div class="filter-field">',
        '          <label class="filter-label">Status</label>',
        '          <select class="form-control form-control-sm" ng-model="vm.filters.status" ng-change="vm.loadCategories()">',
        '            <option value="">All Statuses</option>',
        '            <option value="ACTIVE">ACTIVE</option>',
        '            <option value="ARCHIVED">ARCHIVED</option>',
        '          </select>',
        '        </div>',
        '      </div>',
        '    </div>',

        '    <form class="grid-3 mb-3" ng-submit="vm.createCategory()">',
        '      <input type="text" class="form-control" ng-model="vm.newCat.name" placeholder="New Category Name *" required />',
        '      <input type="text" class="form-control" ng-model="vm.newCat.description" placeholder="Short description" />',
        '      <button type="submit" class="btn btn-primary"><th-icon name="plus" size="15"></th-icon><span>Add Category</span></button>',
        '    </form>',

        '    <div class="table-responsive">',
        '      <table class="data-table" th-datatable dt-data="vm.categories" dt-row="cat" dt-empty="No categories match the selected filters.">',
        '        <thead><tr><th dt-sort="cat.name">Name</th><th dt-sort="cat.slug">Slug</th><th>Description</th><th dt-sort="cat.status">Status</th><th></th></tr></thead>',
        '        <tbody>',
        '          <tr>',
        '            <td><strong>{{ cat.name }}</strong><div class="muted" style="font-size:0.76rem;" ng-if="!vm.filters.competition_id">{{ vm.compMap[cat.competition_id] }}</div></td>',
        '            <td><code>{{ cat.slug }}</code></td><td>{{ cat.description }}</td>',
        '            <td><th-status-badge status="cat.status"></th-status-badge></td>',
        '            <td><button type="button" class="btn btn-sm btn-secondary" ng-click="vm.toggleStatus(cat)">{{ cat.status === "ACTIVE" ? "Archive" : "Activate" }}</button></td>',
        '          </tr>',
        '        </tbody>',
        '      </table>',
        '    </div>',
        '  </div>',
        '</div>'
      ].join(''));
    }]);
})();
