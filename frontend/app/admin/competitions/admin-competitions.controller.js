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
        vm.newCompDates = { openAt: null, closeAt: null };

        // Deadline modal state
        vm.deadlineModal = {
          comp: null,
          openAt: null,
          closeAt: null,
          status: 'APPLICATIONS_OPEN'
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
          var payload = angular.copy(vm.newComp);
          payload.applications_open_at = vm.newCompDates.openAt ? vm.newCompDates.openAt.toISOString() : null;
          payload.applications_close_at = vm.newCompDates.closeAt ? vm.newCompDates.closeAt.toISOString() : null;
          ApiService.post('/admin/competitions', payload).then(function () {
            ToastService.success('Competition created.');
            vm.showCreate = false;
            vm.newCompDates = { openAt: null, closeAt: null };
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

        // --- APPLICATION DEADLINE & OPEN/CLOSE CONTROLS ---
        vm.openDeadlineModal = function (c) {
          vm.deadlineModal.comp = c;
          vm.deadlineModal.openAt = c.applications_open_at ? new Date(c.applications_open_at) : null;
          vm.deadlineModal.closeAt = c.applications_close_at ? new Date(c.applications_close_at) : null;
          vm.deadlineModal.status = c.status;
        };

        vm.closeDeadlineModal = function () {
          vm.deadlineModal.comp = null;
          vm.deadlineModal.openAt = null;
          vm.deadlineModal.closeAt = null;
        };

        vm.applyCompPreset = function (days) {
          var now = new Date();
          vm.deadlineModal.openAt = now;
          if (days === 0) {
            vm.deadlineModal.closeAt = now;
            vm.deadlineModal.status = 'APPLICATIONS_CLOSED';
          } else if (days === -1) {
            vm.deadlineModal.closeAt = null;
            vm.deadlineModal.status = 'APPLICATIONS_OPEN';
          } else {
            var close = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
            vm.deadlineModal.closeAt = close;
            vm.deadlineModal.status = 'APPLICATIONS_OPEN';
          }
        };

        vm.saveCompDeadlines = function () {
          var c = vm.deadlineModal.comp;
          if (!c) return;
          var payload = {
            action: 'set_deadlines',
            applications_open_at: vm.deadlineModal.openAt ? vm.deadlineModal.openAt.toISOString() : null,
            applications_close_at: vm.deadlineModal.closeAt ? vm.deadlineModal.closeAt.toISOString() : null,
            status: vm.deadlineModal.status
          };
          ApiService.post('/admin/competitions/' + c.id + '/application-window', payload).then(function () {
            ToastService.success('Application window and deadlines updated for ' + c.title);
            vm.closeDeadlineModal();
            vm.load();
          }, function (err) { ToastService.error(err.message); });
        };

        vm.openApplicationsNow = function (c) {
          ApiService.post('/admin/competitions/' + c.id + '/application-window', { action: 'open' }).then(function () {
            ToastService.success('Applications are now OPEN for ' + c.title);
            vm.load();
          }, function (err) { ToastService.error(err.message); });
        };

        vm.closeApplicationsNow = function (c) {
          ApiService.post('/admin/competitions/' + c.id + '/application-window', { action: 'close' }).then(function () {
            ToastService.success('Applications are now CLOSED for ' + c.title);
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
        '        <div class="form-group"><label class="form-label">Status</label><select class="form-control" ng-model="vm.newComp.status"><option value="DRAFT">DRAFT</option><option value="PUBLISHED">PUBLISHED</option><option value="APPLICATIONS_OPEN">APPLICATIONS_OPEN</option><option value="SCHEDULED">SCHEDULED</option><option value="VOTING">VOTING</option></select></div>',
        '      </div>',
        '      <div class="form-group"><label class="form-label">Tagline</label><input type="text" class="form-control" ng-model="vm.newComp.tagline" /></div>',
        '      <div class="grid-2">',
        '        <div class="form-group"><label class="form-label">Applications Open At</label><input type="datetime-local" class="form-control" ng-model="vm.newCompDates.openAt" /></div>',
        '        <div class="form-group"><label class="form-label">Applications Deadline (Closes At)</label><input type="datetime-local" class="form-control" ng-model="vm.newCompDates.closeAt" /></div>',
        '      </div>',
        '      <div class="grid-3">',
        '        <div class="form-group"><label class="form-label">Application Fee (GHS)</label><input type="number" step="0.5" min="0" class="form-control" ng-model="vm.newComp.application_fee_major" placeholder="50.00" /></div>',
        '        <div class="form-group"><label class="form-label">Unit Vote Price (Pesewas, 100 = GHS 1.00)</label><input type="number" class="form-control" ng-model="vm.newComp.unit_vote_price_minor" /></div>',
        '        <div class="form-group"><label class="form-label">Prize Summary</label><input type="text" class="form-control" ng-model="vm.newComp.prize_summary" /></div>',
        '      </div>',
        '      <div class="form-group"><label class="form-label">Official Rules</label><textarea class="form-control" ng-model="vm.newComp.rules"></textarea></div>',
        '      <button type="submit" class="btn btn-primary">Create Competition</button>',
        '    </form>',
        '',
        '    <!-- Application Deadline Modal -->',
        '    <div class="modal-backdrop" ng-if="vm.deadlineModal.comp" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(15,23,42,0.75);backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center;z-index:9999;padding:16px;">',
        '      <div class="card" style="max-width:520px;width:100%;margin:0;position:relative;box-shadow:0 20px 40px rgba(0,0,0,0.4);border:1px solid var(--border-strong);background:var(--bg-surface);">',
        '        <div class="flex-between mb-2">',
        '          <h3 style="margin:0;display:flex;align-items:center;gap:8px;font-size:1.15rem;">',
        '            <th-icon name="calendar" size="18" style="color:var(--accent);"></th-icon>',
        '            <span>Application Deadlines: {{ vm.deadlineModal.comp.title }}</span>',
        '          </h3>',
        '          <button type="button" class="btn-close" ng-click="vm.closeDeadlineModal()" aria-label="Close">&times;</button>',
        '        </div>',
        '        <p class="muted" style="font-size:0.85rem;margin-bottom:14px;">',
        '          Configure opening schedule and submission deadlines. Applicants cannot submit entries after the deadline passes.',
        '        </p>',
        '        <div class="mb-3">',
        '          <label class="filter-label mb-1">Quick Presets</label>',
        '          <div class="inline-actions" style="gap:6px;flex-wrap:wrap;">',
        '            <button type="button" class="btn btn-sm btn-secondary" ng-click="vm.applyCompPreset(-1)">Open Now (No Deadline)</button>',
        '            <button type="button" class="btn btn-sm btn-secondary" ng-click="vm.applyCompPreset(7)">7 Days</button>',
        '            <button type="button" class="btn btn-sm btn-secondary" ng-click="vm.applyCompPreset(14)">14 Days</button>',
        '            <button type="button" class="btn btn-sm btn-secondary" ng-click="vm.applyCompPreset(30)">30 Days</button>',
        '            <button type="button" class="btn btn-sm btn-secondary" ng-click="vm.applyCompPreset(0)">Close Now</button>',
        '          </div>',
        '        </div>',
        '        <form ng-submit="vm.saveCompDeadlines()">',
        '          <div class="form-group mb-2">',
        '            <label class="filter-label">Applications Open At</label>',
        '            <input type="datetime-local" class="form-control form-control-sm" ng-model="vm.deadlineModal.openAt" />',
        '            <small class="muted" style="font-size:0.75rem;">Leave empty to allow applications immediately without a start date requirement.</small>',
        '          </div>',
        '          <div class="form-group mb-2">',
        '            <label class="filter-label">Applications Deadline (Closes At)</label>',
        '            <input type="datetime-local" class="form-control form-control-sm" ng-model="vm.deadlineModal.closeAt" />',
        '            <small class="muted" style="font-size:0.75rem;">When reached, application submissions and payments will be rejected.</small>',
        '          </div>',
        '          <div class="form-group mb-3">',
        '            <label class="filter-label">Competition Status</label>',
        '            <select class="form-control form-control-sm" ng-model="vm.deadlineModal.status">',
        '              <option value="APPLICATIONS_OPEN">APPLICATIONS_OPEN (Open now)</option>',
        '              <option value="SCHEDULED">SCHEDULED (Opens automatically at start date)</option>',
        '              <option value="APPLICATIONS_CLOSED">APPLICATIONS_CLOSED (Submissions ended)</option>',
        '              <option value="DRAFT">DRAFT</option>',
        '              <option value="PUBLISHED">PUBLISHED</option>',
        '              <option value="REVIEW">REVIEW</option>',
        '              <option value="VOTING">VOTING</option>',
        '            </select>',
        '          </div>',
        '          <div class="inline-actions" style="justify-content:flex-end;gap:8px;">',
        '            <button type="button" class="btn btn-sm btn-secondary" ng-click="vm.closeDeadlineModal()">Cancel</button>',
        '            <button type="submit" class="btn btn-sm btn-primary">',
        '              <th-icon name="check" size="14"></th-icon><span>Save Deadlines</span>',
        '            </button>',
        '          </div>',
        '        </form>',
        '      </div>',
        '    </div>',
        '',
        '    <div ng-if="!vm.competitions.length" class="card empty-state">No competitions match the selected filters.</div>',
        '    <div class="card mb-2" ng-repeat="c in vm.competitions">',
        '      <div class="flex-between mb-2">',
        '        <div>',
        '          <strong style="font-size:1.05rem;">{{ c.title }}</strong>',
        '          <code style="margin-left:8px;font-size:0.8rem;">{{ c.slug }}</code>',
        '        </div>',
        '        <th-status-badge status="c.status"></th-status-badge>',
        '      </div>',
        '',
        '      <!-- Application Window & Deadlines Box -->',
        '      <div class="mb-2" style="background:var(--bg-subtle, rgba(255,255,255,0.03));border:1px solid var(--border-color);border-radius:6px;padding:10px 14px;">',
        '        <div class="flex-between" style="flex-wrap:wrap;gap:8px;">',
        '          <div>',
        '            <div style="font-weight:600;font-size:0.85rem;display:flex;align-items:center;gap:6px;">',
        '              <th-icon name="calendar" size="14" style="color:var(--accent);"></th-icon>',
        '              <span>Application Window &amp; Deadlines</span>',
        '            </div>',
        '            <div class="muted" style="font-size:0.8rem;margin-top:4px;">',
        '              <span ng-if="c.applications_open_at">Opens: <strong>{{ c.applications_open_at | date:\'medium\' }}</strong></span>',
        '              <span ng-if="!c.applications_open_at">Opens: <em>Immediate / Unrestricted</em></span>',
        '              <span style="margin:0 6px;">•</span>',
        '              <span ng-if="c.applications_close_at">Deadline: <strong style="color:var(--accent);">{{ c.applications_close_at | date:\'medium\' }}</strong></span>',
        '              <span ng-if="!c.applications_close_at">Deadline: <em>No closing deadline set</em></span>',
        '            </div>',
        '          </div>',
        '          <div class="inline-actions" style="gap:6px;">',
        '            <button type="button" class="btn btn-sm btn-secondary" ng-if="c.status !== \'APPLICATIONS_OPEN\'" ng-click="vm.openApplicationsNow(c)" title="Open applications immediately">',
        '              <th-icon name="play" size="13"></th-icon><span>Open Now</span>',
        '            </button>',
        '            <button type="button" class="btn btn-sm btn-secondary" ng-if="c.status === \'APPLICATIONS_OPEN\'" ng-click="vm.closeApplicationsNow(c)" title="Close applications immediately">',
        '              <th-icon name="pause" size="13"></th-icon><span>Close Now</span>',
        '            </button>',
        '            <button type="button" class="btn btn-sm btn-secondary" ng-click="vm.openDeadlineModal(c)" title="Configure schedule and deadline">',
        '              <th-icon name="calendar" size="13"></th-icon><span>Set Deadlines</span>',
        '            </button>',
        '          </div>',
        '        </div>',
        '      </div>',
        '',
        '      <div class="grid-4">',
        '        <div class="form-group"><label class="form-label">Status</label><select class="form-control" ng-model="c.status"><option value="DRAFT">DRAFT</option><option value="PUBLISHED">PUBLISHED</option><option value="APPLICATIONS_OPEN">APPLICATIONS_OPEN</option><option value="SCHEDULED">SCHEDULED</option><option value="APPLICATIONS_CLOSED">APPLICATIONS_CLOSED</option><option value="REVIEW">REVIEW</option><option value="VOTING">VOTING</option><option value="RESULTS_PENDING">RESULTS_PENDING</option><option value="COMPLETED">COMPLETED</option></select></div>',
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
