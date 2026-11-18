(function () {
  'use strict';

  var NOMINEE_VISUALS = {
    'ama-gold': '/assets/images/talent-ama.jpg',
    'kwesi-motion': '/assets/images/talent-kwesi.jpg',
    'poetess-esi': '/assets/images/talent-esi.jpg',
    'king-zongo-bars': '/assets/images/talent-ibrahim.jpg',
    'kojo-laughs': '/assets/images/talent-kojo.jpg'
  };
  var DEFAULT_IMAGES = [
    '/assets/images/talent-ama.jpg',
    '/assets/images/talent-kwesi.jpg',
    '/assets/images/talent-esi.jpg',
    '/assets/images/talent-ibrahim.jpg',
    '/assets/images/talent-kojo.jpg'
  ];

  function resolveImage(slug, idx) {
    var s = (slug || '').toLowerCase();
    for (var k in NOMINEE_VISUALS) {
      if (s.indexOf(k) !== -1) return NOMINEE_VISUALS[k];
    }
    return DEFAULT_IMAGES[idx % DEFAULT_IMAGES.length];
  }

  angular.module('talentHuntApp')
    .controller('NomineesDirectoryController', [
      '$location', 'ApiService', 'AuthService', 'PermissionsService', 'ToastService',
      function ($location, ApiService, AuthService, PermissionsService, ToastService) {
        var vm = this;
        vm.loading = true;
        vm.nominees = [];
        vm.meta = {};
        vm.categories = [];
        vm.competitions = [];
        vm.totalNomineeCount = 0;
        vm.viewMode = 'grid'; // 'grid' | 'grouped'
        vm.groupedCategories = [];
        vm.showAddCategoryModal = false;
        vm.showManagerPromptModal = false;
        vm.submittingCategory = false;

        vm.iconOptions = ['star', 'music', 'zap', 'mic', 'smile', 'trophy', 'award', 'film', 'heart', 'tag'];

        vm.categoryForm = {
          competition_id: '',
          name: '',
          description: '',
          icon: 'star',
          status: 'ACTIVE'
        };

        vm.filters = {
          q: $location.search().q || '',
          category: $location.search().category || '',
          status: $location.search().status || '',
          competition: $location.search().competition || '',
          page: 1
        };

        vm.canManage = function () {
          return PermissionsService.canManageCompetition();
        };

        vm.loadCategories = function () {
          var params = {};
          if (vm.filters.competition) {
            params.competition = vm.filters.competition;
          }
          return ApiService.get('/categories', params).then(function (res) {
            vm.categories = res.data || [];
            var count = 0;
            vm.categories.forEach(function (cat) {
              count += (cat.nominee_count || 0);
            });
            vm.totalNomineeCount = count;
            if (vm.viewMode === 'grouped' && vm.nominees.length) {
              vm.buildGroupedCategories();
            }
            return res.data;
          }, function () {
            vm.categories = [];
          });
        };

        vm.loadCompetitions = function () {
          ApiService.get('/competitions').then(function (res) {
            vm.competitions = res.data || [];
            if (vm.competitions.length > 0 && !vm.categoryForm.competition_id) {
              vm.categoryForm.competition_id = vm.competitions[0].id;
            }
          });
        };

        vm.buildGroupedCategories = function () {
          if (!vm.nominees || !vm.nominees.length) {
            vm.groupedCategories = [];
            return;
          }
          var map = {};
          var groups = [];

          // Initialize with known categories
          vm.categories.forEach(function (cat) {
            var g = {
              id: cat.id,
              slug: cat.slug,
              name: cat.name,
              description: cat.description,
              icon: cat.icon || 'star',
              nominees: []
            };
            map[cat.id] = g;
            map[cat.name] = g;
            groups.push(g);
          });

          // Unassigned fallback group
          var unassigned = {
            id: 'other',
            slug: 'other',
            name: 'Other Performers',
            description: 'Contestants from open or uncategorized showcases',
            icon: 'star',
            nominees: []
          };

          vm.nominees.forEach(function (n) {
            var target = (n.category_id && map[n.category_id]) || (n.category_name && map[n.category_name]);
            if (target) {
              target.nominees.push(n);
            } else {
              unassigned.nominees.push(n);
            }
          });

          if (unassigned.nominees.length > 0) {
            groups.push(unassigned);
          }

          vm.groupedCategories = groups;
        };

        vm.toggleViewMode = function (mode) {
          vm.viewMode = mode;
          if (mode === 'grouped') {
            vm.buildGroupedCategories();
          }
        };

        vm.selectCategory = function (slug) {
          vm.filters.category = slug || '';
          vm.load(1);
        };

        vm.load = function (page) {
          vm.filters.page = page || 1;
          vm.loading = true;
          ApiService.get('/nominees', vm.filters).then(function (res) {
            vm.nominees = res.data || [];
            if (vm.nominees) {
              vm.nominees.forEach(function (n, idx) {
                n.image = resolveImage(n.public_slug, idx);
              });
            }
            vm.meta = res.meta || {};
            if (vm.viewMode === 'grouped') {
              vm.buildGroupedCategories();
            }
            vm.loading = false;
          }, function () {
            vm.loading = false;
          });
        };

        vm.onCompetitionChange = function () {
          $location.search('competition', vm.filters.competition || null);
          vm.filters.category = '';
          $location.search('category', null);
          vm.loadCategories().then(function () {
            vm.load(1);
          });
        };

        vm.reset = function () {
          vm.filters = { q: '', category: '', status: '', competition: '', page: 1 };
          $location.search({});
          vm.loadCategories().then(function () {
            vm.load(1);
          });
        };

        vm.openAddCategoryModal = function () {
          if (!AuthService.state.user || !PermissionsService.canManageCompetition()) {
            vm.showManagerPromptModal = true;
            return;
          }
          vm.categoryForm.name = '';
          vm.categoryForm.description = '';
          vm.categoryForm.icon = 'star';
          vm.categoryForm.status = 'ACTIVE';
          if (vm.competitions.length > 0 && !vm.categoryForm.competition_id) {
            vm.categoryForm.competition_id = vm.competitions[0].id;
          }
          vm.showAddCategoryModal = true;
        };

        vm.closeModals = function () {
          vm.showAddCategoryModal = false;
          vm.showManagerPromptModal = false;
        };

        vm.selectIcon = function (ico) {
          vm.categoryForm.icon = ico;
        };

        vm.submitAddCategory = function () {
          if (!vm.categoryForm.name || vm.categoryForm.name.trim().length < 2) {
            ToastService.error('Please enter a valid category name (at least 2 characters).');
            return;
          }
          if (!vm.categoryForm.competition_id) {
            ToastService.error('Please select an active competition for this category.');
            return;
          }
          vm.submittingCategory = true;
          ApiService.post('/admin/categories', vm.categoryForm).then(function (res) {
            ToastService.success('Category "' + res.data.name + '" created successfully!');
            vm.closeModals();
            vm.loadCategories().then(function () {
              vm.selectCategory(res.data.slug);
            });
          }, function (err) {
            var msg = (err && err.data && err.data.error && err.data.error.message) ||
                      (err && err.data && err.data.message) ||
                      'Failed to create category. Please ensure you have Competition Manager permissions.';
            ToastService.error(msg);
          }).finally(function () {
            vm.submittingCategory = false;
          });
        };

        // Initialize
        vm.loadCategories();
        vm.loadCompetitions();
        vm.load(1);
      }
    ])
    .run(['$templateCache', function ($templateCache) {
      $templateCache.put('public/nominees.html', [
        '<div class="page-header">',
        '  <div class="container">',
        '    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:16px;">',
        '      <div>',
        '        <h1 style="margin:0 0 6px;">Nominee Directory</h1>',
        '        <p style="margin:0;color:var(--text-secondary);font-size:1rem;">Search verified contestants across programs &amp; categories, watch audition demos, and cast paid votes.</p>',
        '      </div>',
        '      <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;">',
        '        <!-- COMPETITION SELECTOR DROPDOWN IN HEADER -->',
        '        <div style="display:flex;align-items:center;gap:8px;background:rgba(255,255,255,0.06);padding:6px 12px;border-radius:var(--radius-md);border:1px solid rgba(255,255,255,0.12);">',
        '          <th-icon name="trophy" size="18"></th-icon>',
        '          <div style="display:flex;flex-direction:column;gap:2px;">',
        '            <label style="font-size:0.72rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.04em;margin:0;">Competition</label>',
        '            <select class="form-control form-control-sm" style="font-weight:600;min-width:210px;" ng-model="vm.filters.competition" ng-change="vm.onCompetitionChange()">',
        '              <option value="">All Competitions</option>',
        '              <option ng-repeat="comp in vm.competitions" value="{{ comp.slug }}">{{ comp.title }}</option>',
        '            </select>',
        '          </div>',
        '        </div>',
        '        <button type="button" class="btn btn-primary" ng-click="vm.openAddCategoryModal()" style="display:inline-flex;align-items:center;gap:6px;">',
        '          <th-icon name="plus" size="16"></th-icon>',
        '          <span>+ Add Category</span>',
        '        </button>',
        '      </div>',
        '    </div>',
        '  </div>',
        '</div>',

        '<div class="container mb-4">',
        '  <!-- SPONSOR & GOOGLE ADS LEADERBOARD BANNER -->',
        '  <th-ad-banner slot="nominees_top" format="leaderboard"></th-ad-banner>',

        '  <!-- INTERACTIVE CATEGORY PILLS BAR -->',
        '  <div class="nominees-category-card">',
        '    <div class="nominees-category-topbar">',
        '      <div class="nominees-category-heading">',
        '        <th-icon name="layers" size="18"></th-icon>',
        '        <span>Browse Programs by Category</span>',
        '      </div>',
        '      <div class="nominees-view-actions">',
        '        <div class="nominees-view-toggle">',
        '          <button type="button" class="nominees-view-btn" ng-class="{\'active\': vm.viewMode === \'grid\'}" ng-click="vm.toggleViewMode(\'grid\')" title="Display in grid layout">',
        '            <th-icon name="grid" size="14"></th-icon> <span>Grid</span>',
        '          </button>',
        '          <button type="button" class="nominees-view-btn" ng-class="{\'active\': vm.viewMode === \'grouped\'}" ng-click="vm.toggleViewMode(\'grouped\')" title="Group contestants under category headers">',
        '            <th-icon name="list" size="14"></th-icon> <span>By Category</span>',
        '          </button>',
        '        </div>',
        '        <button type="button" class="btn btn-sm btn-secondary" ng-click="vm.openAddCategoryModal()" title="Add a new competition talent category">',
        '          <th-icon name="plus" size="14"></th-icon> <span>New Category</span>',
        '        </button>',
        '      </div>',
        '    </div>',
        '    <div class="nominees-category-pills">',
        '      <button type="button" class="category-pill-btn" ng-class="{\'active\': !vm.filters.category}" ng-click="vm.selectCategory(\'\')">',
        '        <th-icon name="star" size="14"></th-icon>',
        '        <span>All Categories</span>',
        '        <span class="category-pill-count">{{ vm.totalNomineeCount || vm.nominees.length || 0 }}</span>',
        '      </button>',
        '      <button type="button" class="category-pill-btn" ng-repeat="cat in vm.categories" ng-class="{\'active\': vm.filters.category === cat.slug}" ng-click="vm.selectCategory(cat.slug)">',
        '        <th-icon name="{{ cat.icon || \'star\' }}" size="14"></th-icon>',
        '        <span>{{ cat.name }}</span>',
        '        <span class="category-pill-count">{{ cat.nominee_count !== undefined ? cat.nominee_count : 0 }}</span>',
        '      </button>',
        '      <button type="button" class="category-pill-btn category-pill-add" ng-click="vm.openAddCategoryModal()" title="Create a new competition category">',
        '        <th-icon name="plus" size="14"></th-icon>',
        '        <span>Add Category</span>',
        '      </button>',
        '    </div>',
        '  </div>',

        '  <!-- SEARCH & FILTER CONTROLS WITH COMPETITION DROPDOWN -->',
        '  <form class="card mb-3" ng-submit="vm.load(1)">',
        '    <div class="grid-5">',
        '      <div><label class="form-label">Search Name or City</label><input type="text" class="form-control" ng-model="vm.filters.q" placeholder="e.g. Ama Gold, Accra..." /></div>',
        '      <div>',
        '        <label class="form-label">Competition</label>',
        '        <select class="form-control" ng-model="vm.filters.competition" ng-change="vm.onCompetitionChange()">',
        '          <option value="">All Competitions</option>',
        '          <option ng-repeat="comp in vm.competitions" value="{{ comp.slug }}">{{ comp.title }}</option>',
        '        </select>',
        '      </div>',
        '      <div><label class="form-label">Category</label><select class="form-control" ng-model="vm.filters.category" ng-change="vm.load(1)"><option value="">All Categories</option><option ng-repeat="c in vm.categories" value="{{ c.slug }}">{{ c.name }}</option></select></div>',
        '      <div><label class="form-label">Contestant Status</label><select class="form-control" ng-model="vm.filters.status"><option value="">All Public Statuses</option><option value="ACTIVE">Active in Round</option><option value="QUALIFIED">Qualified</option><option value="WINNER">Winner</option><option value="ELIMINATED">Eliminated</option></select></div>',
        '      <div style="display:flex;align-items:flex-end;gap:8px;"><button type="submit" class="btn btn-primary" style="flex:1;">Filter</button><button type="button" class="btn btn-secondary" ng-click="vm.reset()">Reset</button></div>',
        '    </div>',
        '  </form>',

        '  <!-- LOADING SPINNER / EMPTY STATE -->',
        '  <div ng-if="vm.loading" class="loading-box">Loading nominees...</div>',
        '  <div ng-if="!vm.loading && !vm.nominees.length" class="card empty-state">No nominees matched your search criteria.</div>',

        '  <!-- STANDARD GRID VIEW -->',
        '  <div class="grid-3" ng-if="!vm.loading && vm.nominees.length && vm.viewMode === \'grid\'">',
        '    <div class="card nominee-card" ng-repeat="n in vm.nominees">',
        '      <div class="nominee-card-banner">',
        '        <img ng-src="{{ n.image }}" alt="{{ n.public_name }}" />',
        '        <div class="nominee-card-banner-overlay">',
        '          <div class="nominee-avatar" style="width:40px;height:40px;font-size:0.9rem;border:2px solid #fff;">{{ n.public_name | initials }}</div>',
        '          <span class="category-badge-pill" style="position:static;">{{ n.category_name }}</span>',
        '        </div>',
        '      </div>',
        '      <div class="nominee-card-content">',
        '        <div>',
        '          <h3 style="margin:0;font-size:1.1rem;"><a ng-href="/nominee/{{ n.public_slug }}">{{ n.public_name }}</a></h3>',
        '          <div class="nominee-meta mb-1">{{ n.location || "Ghana" }}</div>',
        '          <p style="font-size:0.88rem;color:var(--text-secondary);margin:0 0 12px;">{{ n.tagline || (n.profile_text | limitTo:100) }}</p>',
        '        </div>',
        '        <div>',
        '          <div class="flex-between mb-2">',
        '            <th-status-badge status="n.status"></th-status-badge>',
        '            <span class="nominee-votes-pill" ng-if="n.public_votes !== undefined && n.public_votes !== null">&#9733; {{ n.public_votes | number }} votes</span>',
        '          </div>',
        '          <div class="inline-actions" style="width:100%;">',
        '            <a ng-href="/nominee/{{ n.public_slug }}" class="btn btn-sm btn-secondary" style="flex:1;">View Demo</a>',
        '            <a ng-if="n.status === \'ACTIVE\' || n.status === \'QUALIFIED\'" ng-href="{{ n.voting_path }}" class="btn btn-sm btn-primary" style="flex:1;">Vote Now</a>',
        '          </div>',
        '        </div>',
        '      </div>',
        '    </div>',
        '  </div>',

        '  <!-- GROUPED BY CATEGORY VIEW -->',
        '  <div ng-if="!vm.loading && vm.nominees.length && vm.viewMode === \'grouped\'">',
        '    <div class="nominees-category-group" ng-repeat="grp in vm.groupedCategories" ng-if="grp.nominees.length">',
        '      <div class="category-group-header">',
        '        <div class="category-group-info">',
        '          <div class="category-group-icon">',
        '            <th-icon name="{{ grp.icon || \'star\' }}" size="22"></th-icon>',
        '          </div>',
        '          <div>',
        '            <h2 class="category-group-title">{{ grp.name }}</h2>',
        '            <p class="category-group-desc" ng-if="grp.description">{{ grp.description }}</p>',
        '          </div>',
        '        </div>',
        '        <span class="category-group-badge">{{ grp.nominees.length }} {{ grp.nominees.length === 1 ? \'Contestant\' : \'Contestants\' }}</span>',
        '      </div>',
        '      <div class="grid-3">',
        '        <div class="card nominee-card" ng-repeat="n in grp.nominees">',
        '          <div class="nominee-card-banner">',
        '            <img ng-src="{{ n.image }}" alt="{{ n.public_name }}" />',
        '            <div class="nominee-card-banner-overlay">',
        '              <div class="nominee-avatar" style="width:40px;height:40px;font-size:0.9rem;border:2px solid #fff;">{{ n.public_name | initials }}</div>',
        '              <span class="category-badge-pill" style="position:static;">{{ n.category_name }}</span>',
        '            </div>',
        '          </div>',
        '          <div class="nominee-card-content">',
        '            <div>',
        '              <h3 style="margin:0;font-size:1.1rem;"><a ng-href="/nominee/{{ n.public_slug }}">{{ n.public_name }}</a></h3>',
        '              <div class="nominee-meta mb-1">{{ n.location || "Ghana" }}</div>',
        '              <p style="font-size:0.88rem;color:var(--text-secondary);margin:0 0 12px;">{{ n.tagline || (n.profile_text | limitTo:100) }}</p>',
        '            </div>',
        '            <div>',
        '              <div class="flex-between mb-2">',
        '                <th-status-badge status="n.status"></th-status-badge>',
        '                <span class="nominee-votes-pill" ng-if="n.public_votes !== undefined && n.public_votes !== null">&#9733; {{ n.public_votes | number }} votes</span>',
        '              </div>',
        '              <div class="inline-actions" style="width:100%;">',
        '                <a ng-href="/nominee/{{ n.public_slug }}" class="btn btn-sm btn-secondary" style="flex:1;">View Demo</a>',
        '                <a ng-if="n.status === \'ACTIVE\' || n.status === \'QUALIFIED\'" ng-href="{{ n.voting_path }}" class="btn btn-sm btn-primary" style="flex:1;">Vote Now</a>',
        '              </div>',
        '            </div>',
        '          </div>',
        '        </div>',
        '      </div>',
        '    </div>',
        '  </div>',

        '  <th-pagination ng-if="vm.meta && vm.meta.pages > 1" page="vm.meta.page" pages="vm.meta.pages" on-page="vm.load(page)"></th-pagination>',

        '  <!-- MODAL: ADD CATEGORY (MANAGERS & SUPER ADMINS) -->',
        '  <div class="modal-backdrop" ng-if="vm.showAddCategoryModal" ng-click="vm.closeModals()"></div>',
        '  <div class="modal-dialog" ng-if="vm.showAddCategoryModal" role="dialog" aria-modal="true" style="max-width:540px;">',
        '    <div class="modal-header">',
        '      <h3 style="margin:0;display:flex;align-items:center;gap:8px;">',
        '        <th-icon name="plus" size="18"></th-icon> <span>Add Talent Category</span>',
        '      </h3>',
        '      <button type="button" class="btn-close" ng-click="vm.closeModals()" aria-label="Close">&times;</button>',
        '    </div>',
        '    <form ng-submit="vm.submitAddCategory()">',
        '      <div class="modal-body">',
        '        <div class="form-group mb-3">',
        '          <label class="form-label">Competition Scope <span style="color:var(--danger)">*</span></label>',
        '          <select class="form-control" ng-model="vm.categoryForm.competition_id" required>',
        '            <option value="" disabled>Select Target Competition</option>',
        '            <option ng-repeat="comp in vm.competitions" value="{{ comp.id }}">{{ comp.title || comp.name }} ({{ comp.slug }})</option>',
        '          </select>',
        '        </div>',
        '        <div class="form-group mb-3">',
        '          <label class="form-label">Category Name <span style="color:var(--danger)">*</span></label>',
        '          <input type="text" class="form-control" ng-model="vm.categoryForm.name" placeholder="e.g. Traditional &amp; Folk Arts" required minlength="2" maxlength="100" />',
        '        </div>',
        '        <div class="form-group mb-3">',
        '          <label class="form-label">Description (Optional)</label>',
        '          <textarea class="form-control" rows="2" ng-model="vm.categoryForm.description" placeholder="Brief summary of eligible performance styles, genres, or audition guidelines..."></textarea>',
        '        </div>',
        '        <div class="form-group mb-3">',
        '          <label class="form-label">Choose Category Icon</label>',
        '          <div class="icon-picker-grid">',
        '            <button type="button" class="icon-picker-item" ng-repeat="ico in vm.iconOptions" ng-class="{\'selected\': vm.categoryForm.icon === ico}" ng-click="vm.selectIcon(ico)">',
        '              <th-icon name="{{ ico }}" size="18"></th-icon>',
        '              <span>{{ ico }}</span>',
        '            </button>',
        '          </div>',
        '        </div>',
        '      </div>',
        '      <div class="modal-footer">',
        '        <button type="button" class="btn btn-secondary" ng-click="vm.closeModals()" ng-disabled="vm.submittingCategory">Cancel</button>',
        '        <button type="submit" class="btn btn-primary" ng-disabled="vm.submittingCategory">',
        '          <span ng-if="vm.submittingCategory">Creating...</span>',
        '          <span ng-if="!vm.submittingCategory">+ Create Category</span>',
        '        </button>',
        '      </div>',
        '    </form>',
        '  </div>',

        '  <!-- MODAL: MANAGER SIGN-IN REQUIRED PROMPT -->',
        '  <div class="modal-backdrop" ng-if="vm.showManagerPromptModal" ng-click="vm.closeModals()"></div>',
        '  <div class="modal-dialog" ng-if="vm.showManagerPromptModal" role="dialog" aria-modal="true" style="max-width:480px;text-align:center;">',
        '    <div class="modal-header" style="justify-content:center;position:relative;">',
        '      <h3 style="margin:0;display:flex;align-items:center;gap:8px;">',
        '        <th-icon name="shield" size="20"></th-icon> <span>Manager Access Required</span>',
        '      </h3>',
        '      <button type="button" class="btn-close" ng-click="vm.closeModals()" style="position:absolute;right:16px;top:16px;" aria-label="Close">&times;</button>',
        '    </div>',
        '    <div class="modal-body" style="padding:28px 20px;">',
        '      <div style="width:60px;height:60px;border-radius:50%;background:rgba(245, 158, 11, 0.14);color:#f59e0b;display:inline-flex;align-items:center;justify-content:center;margin-bottom:16px;">',
        '        <th-icon name="lock" size="30"></th-icon>',
        '      </div>',
        '      <h4 style="margin:0 0 8px;font-size:1.15rem;">Competition Manager Privileges Needed</h4>',
        '      <p style="color:var(--text-secondary);font-size:0.92rem;line-height:1.55;margin:0 0 22px;">',
        '        Adding new competition categories modifies official competition parameters and requires Competition Manager or Super Admin sign-in.',
        '      </p>',
        '      <div style="display:flex;gap:12px;justify-content:center;">',
        '        <a href="/portal/login" class="btn btn-primary" style="display:inline-flex;align-items:center;gap:6px;">',
        '          <th-icon name="log-in" size="14"></th-icon> <span>Sign In as Manager</span>',
        '        </a>',
        '        <button type="button" class="btn btn-secondary" ng-click="vm.closeModals()">Close</button>',
        '      </div>',
        '    </div>',
        '  </div>',

        '</div>'
      ].join(''));
    }]);
})();