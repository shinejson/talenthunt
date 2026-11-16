(function () {
  'use strict';

  var savedAdminScrollTop = 0;

  var ADMIN_NAV_META = {
    '/admin': { label: 'KPI Overview', icon: 'dashboard' },
    '/admin/competitions': { label: 'Competitions', icon: 'trophy' },
    '/admin/categories': { label: 'Categories', icon: 'layers' },
    '/admin/rounds': { label: 'Rounds & Packages', icon: 'clock' },
    '/admin/submissions': { label: 'Review Queue', icon: 'clipboard-check' },
    '/admin/nominees': { label: 'Nominees', icon: 'award' },
    '/admin/votes': { label: 'Vote Ledger', icon: 'book-ledger' },
    '/admin/orders': { label: 'Orders', icon: 'receipt' },
    '/admin/reconciliation': { label: 'Payments & Reconcile', icon: 'credit-card' },
    '/admin/eliminations': { label: 'Eliminations', icon: 'target' },
    '/admin/sponsors-partners': { label: 'Sponsors & Partners', icon: 'handshake' },
    '/admin/moderation': { label: 'Moderation & Support', icon: 'shield-alert' },
    '/admin/reports': { label: 'Reports & CSV', icon: 'pie-chart' },
    '/admin/audit-logs': { label: 'Audit Logs', icon: 'history' },
    '/admin/users': { label: 'Users & Roles', icon: 'users' },
    '/admin/settings': { label: 'Platform Settings', icon: 'settings' }
  };

  angular.module('talentHuntApp')
    .component('thAdminNav', {
      template: [
        '<div class="side-nav-mobile-bar">',
        '  <span class="side-nav-mobile-current"><th-icon name="{{ $ctrl.currentIcon() }}" size="17"></th-icon><span>{{ $ctrl.currentLabel() }}</span></span>',
        '  <button type="button" class="btn btn-sm btn-secondary" ng-click="$ctrl.drawerOpen = !$ctrl.drawerOpen" aria-expanded="{{ $ctrl.drawerOpen }}">',
        '    <th-icon name="{{ $ctrl.drawerOpen ? \'x\' : \'sliders\' }}" size="15"></th-icon>',
        '    <span>{{ $ctrl.drawerOpen ? "Close" : "Admin Menu" }}</span>',
        '  </button>',
        '</div>',
        '<div class="side-nav-backdrop" ng-if="$ctrl.drawerOpen" ng-click="$ctrl.drawerOpen = false"></div>',
        '<aside class="side-nav" ng-class="{\'drawer-open\': $ctrl.drawerOpen}" aria-label="Admin Navigation">',
        '  <div class="side-nav-header">',
        '    <div class="side-nav-title"><th-icon name="shield" size="15"></th-icon><span>Admin Console</span></div>',
        '    <span class="side-nav-status-badge"><span class="status-dot"></span> Live</span>',
        '  </div>',
        '  <div class="side-nav-body">',
        '    <div class="side-nav-section-label">Overview</div>',
        '    <a href="/admin" ng-click="$ctrl.drawerOpen=false" ng-class="{active: $ctrl.is(\'/admin\')}"><th-icon name="dashboard" size="17"></th-icon><span>KPI Overview</span></a>',

        '    <div class="side-nav-section-label" ng-if="$ctrl.perms.canManageCompetition()">Competition Setup</div>',
        '    <a ng-if="$ctrl.perms.canManageCompetition()" href="/admin/competitions" ng-click="$ctrl.drawerOpen=false" ng-class="{active: $ctrl.is(\'/admin/competitions\')}"><th-icon name="trophy" size="17"></th-icon><span>Competitions</span></a>',
        '    <a ng-if="$ctrl.perms.canManageCompetition()" href="/admin/categories" ng-click="$ctrl.drawerOpen=false" ng-class="{active: $ctrl.is(\'/admin/categories\')}"><th-icon name="layers" size="17"></th-icon><span>Categories</span></a>',
        '    <a ng-if="$ctrl.perms.canManageCompetition()" href="/admin/rounds" ng-click="$ctrl.drawerOpen=false" ng-class="{active: $ctrl.is(\'/admin/rounds\')}"><th-icon name="clock" size="17"></th-icon><span>Rounds &amp; Packages</span></a>',
        '    <a ng-if="$ctrl.perms.canManageCompetition()" href="/admin/eliminations" ng-click="$ctrl.drawerOpen=false" ng-class="{active: $ctrl.is(\'/admin/eliminations\')}"><th-icon name="target" size="17"></th-icon><span>Eliminations</span></a>',

        '    <div class="side-nav-section-label" ng-if="$ctrl.perms.canReview() || $ctrl.perms.canModerate() || $ctrl.perms.canManageCompetition() || $ctrl.perms.canFinance()">Talent &amp; Trust</div>',
        '    <a ng-if="$ctrl.perms.canReview() || $ctrl.perms.canModerate()" href="/admin/submissions" ng-click="$ctrl.drawerOpen=false" ng-class="{active: $ctrl.is(\'/admin/submissions\')}"><th-icon name="clipboard-check" size="17"></th-icon><span>Review Queue</span></a>',
        '    <a ng-if="$ctrl.perms.canManageCompetition() || $ctrl.perms.canModerate() || $ctrl.perms.canFinance()" href="/admin/nominees" ng-click="$ctrl.drawerOpen=false" ng-class="{active: $ctrl.is(\'/admin/nominees\')}"><th-icon name="award" size="17"></th-icon><span>Nominees</span></a>',
        '    <a ng-if="$ctrl.perms.canManageCompetition() || $ctrl.perms.canModerate() || $ctrl.perms.canFinance()" href="/admin/sponsors-partners" ng-click="$ctrl.drawerOpen=false" ng-class="{active: $ctrl.is(\'/admin/sponsors-partners\')}"><th-icon name="handshake" size="17"></th-icon><span>Sponsors &amp; Partners</span></a>',
        '    <a ng-if="$ctrl.perms.canModerate() || $ctrl.perms.canFinance()" href="/admin/moderation" ng-click="$ctrl.drawerOpen=false" ng-class="{active: $ctrl.is(\'/admin/moderation\')}"><th-icon name="shield-alert" size="17"></th-icon><span>Moderation &amp; Support</span></a>',

        '    <div class="side-nav-section-label" ng-if="$ctrl.perms.canFinance()">Finance &amp; Ledger</div>',
        '    <a ng-if="$ctrl.perms.canFinance()" href="/admin/votes" ng-click="$ctrl.drawerOpen=false" ng-class="{active: $ctrl.is(\'/admin/votes\')}"><th-icon name="book-ledger" size="17"></th-icon><span>Vote Ledger</span></a>',
        '    <a ng-if="$ctrl.perms.canFinance()" href="/admin/orders" ng-click="$ctrl.drawerOpen=false" ng-class="{active: $ctrl.is(\'/admin/orders\')}"><th-icon name="receipt" size="17"></th-icon><span>Orders</span></a>',
        '    <a ng-if="$ctrl.perms.canFinance()" href="/admin/reconciliation" ng-click="$ctrl.drawerOpen=false" ng-class="{active: $ctrl.is(\'/admin/reconciliation\')}"><th-icon name="credit-card" size="17"></th-icon><span>Payments &amp; Reconcile</span></a>',
        '    <a ng-if="$ctrl.perms.canFinance()" href="/admin/reports" ng-click="$ctrl.drawerOpen=false" ng-class="{active: $ctrl.is(\'/admin/reports\')}"><th-icon name="pie-chart" size="17"></th-icon><span>Reports &amp; CSV</span></a>',
        '    <a ng-if="$ctrl.perms.canFinance()" href="/admin/audit-logs" ng-click="$ctrl.drawerOpen=false" ng-class="{active: $ctrl.is(\'/admin/audit-logs\')}"><th-icon name="history" size="17"></th-icon><span>Audit Logs</span></a>',

        '    <div class="side-nav-section-label" ng-if="$ctrl.perms.isSuperAdmin() || $ctrl.perms.canManageCompetition()">Administration</div>',
        '    <a ng-if="$ctrl.perms.isSuperAdmin()" href="/admin/users" ng-click="$ctrl.drawerOpen=false" ng-class="{active: $ctrl.is(\'/admin/users\')}"><th-icon name="users" size="17"></th-icon><span>Users &amp; Roles</span></a>',
        '    <a ng-if="$ctrl.perms.canManageCompetition()" href="/admin/settings" ng-click="$ctrl.drawerOpen=false" ng-class="{active: $ctrl.is(\'/admin/settings\')}"><th-icon name="settings" size="17"></th-icon><span>Platform Settings</span></a>',
        '  </div>',
        '  <div class="side-nav-footer">',
        '    <div class="side-nav-user-card" ng-if="$ctrl.user">',
        '      <div class="side-nav-user-avatar">{{ $ctrl.user.full_name | initials }}</div>',
        '      <div class="side-nav-user-info">',
        '        <div class="side-nav-user-name" title="{{ $ctrl.user.full_name }}">{{ $ctrl.user.full_name }}</div>',
        '        <div class="side-nav-user-role">{{ $ctrl.primaryRole() }}</div>',
        '      </div>',
        '    </div>',
        '    <div class="side-nav-footer-actions">',
        '      <a href="/" class="side-nav-footer-btn" title="View Public Website">',
        '        <th-icon name="home" size="14"></th-icon><span>Public Site</span>',
        '      </a>',
        '      <a href="/portal/dashboard" class="side-nav-footer-btn" title="Go to Contestant Portal">',
        '        <th-icon name="user" size="14"></th-icon><span>My Portal</span>',
        '      </a>',
        '      <button type="button" class="side-nav-footer-btn btn-signout" ng-click="$ctrl.logout()" title="Sign Out">',
        '        <th-icon name="log-out" size="14"></th-icon><span>Sign Out</span>',
        '      </button>',
        '    </div>',
        '    <div class="side-nav-version-tag">',
        '      <span>StageLight Admin</span>',
        '      <span>&bull;</span>',
        '      <span class="status-online">&#9679; v1.0 Live</span>',
        '    </div>',
        '  </div>',
        '</aside>'
      ].join(''),
      controller: ['$location', '$element', '$timeout', 'AuthService', 'PermissionsService',
        function ($location, $element, $timeout, AuthService, PermissionsService) {
          var vm = this;
          vm.auth = AuthService;
          vm.perms = PermissionsService;
          vm.drawerOpen = false;
          vm.user = AuthService.state.user;

          vm.is = function (p) { return $location.path() === p; };

          vm.currentLabel = function () {
            var item = ADMIN_NAV_META[$location.path()];
            return item ? item.label : 'Admin Console';
          };
          vm.currentIcon = function () {
            var item = ADMIN_NAV_META[$location.path()];
            return item ? item.icon : 'shield';
          };

          vm.primaryRole = function () {
            var u = vm.user || (AuthService.state && AuthService.state.user);
            if (!u || !u.roles || !u.roles.length) return 'Administrator';
            var r = u.roles[0];
            var names = {
              'SUPER_ADMIN': 'Super Admin',
              'COMPETITION_MANAGER': 'Comp Manager',
              'REVIEWER': 'Reviewer / Judge',
              'FINANCE_OFFICER': 'Finance Officer',
              'MODERATOR': 'Moderator',
              'NOMINEE': 'Nominee Contestant',
              'APPLICANT': 'Applicant'
            };
            return names[r] || r;
          };

          vm.logout = function () {
            AuthService.logout();
          };

          vm.$postLink = function () {
            var scrollEl = $element[0] && ($element[0].querySelector('.side-nav-body') || $element[0].querySelector('aside.side-nav'));
            if (!scrollEl) return;
            scrollEl.scrollTop = savedAdminScrollTop;
            angular.element(scrollEl).on('scroll', function () {
              savedAdminScrollTop = scrollEl.scrollTop;
            });
            $timeout(function () {
              var activeEl = scrollEl.querySelector('a.active');
              if (activeEl && activeEl.scrollIntoView) {
                activeEl.scrollIntoView({ block: 'nearest' });
              }
            }, 0, false);
          };
        }]
    })
    .controller('AdminDashboardController', ['$rootScope', 'ApiService', 'PermissionsService', 'ToastService', 'AdminFilterUtils',
      function ($rootScope, ApiService, PermissionsService, ToastService, AdminFilterUtils) {
        var vm = this;
        vm.perms = PermissionsService;
        vm.loading = true;
        vm.data = null;
        vm.competitions = [];
        vm.pauseForm = { paused: false, incident_message: '' };
        vm.filters = {
          competition_id: '',
          audit_entity: '',
          audit_q: ''
        };

        vm.activeFilterCount = function () {
          return AdminFilterUtils.countActive(vm.filters);
        };

        vm.resetFilters = function () {
          vm.filters = { competition_id: '', audit_entity: '', audit_q: '' };
          vm.load();
        };

        vm.load = function () {
          ApiService.get('/admin/dashboard', AdminFilterUtils.cleanParams(vm.filters)).then(function (res) {
            vm.data = res.data;
            vm.competitions = res.data.competitions || [];
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
            $rootScope.$broadcast('incidentBannerChanged');
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
        '    <div class="flex-between mb-2">',
        '      <h1 style="margin:0;font-size:1.55rem;">Platform Operations Overview</h1>',
        '      <button type="button" class="btn btn-sm btn-secondary" ng-click="vm.load()"><th-icon name="refresh" size="15"></th-icon><span>Refresh</span></button>',
        '    </div>',

        '    <div class="filter-bar">',
        '      <div class="filter-bar-top">',
        '        <span class="filter-bar-title"><th-icon name="filter" size="14"></th-icon><span>Dashboard &amp; Activity Filters</span></span>',
        '        <div class="inline-actions">',
        '          <span class="filter-count-pill" ng-class="{\'filter-active-badge\': vm.activeFilterCount() > 0}" ng-if="vm.activeFilterCount() > 0">{{ vm.activeFilterCount() }} active</span>',
        '          <button type="button" class="btn btn-sm btn-secondary" ng-if="vm.activeFilterCount() > 0" ng-click="vm.resetFilters()"><th-icon name="rotate-ccw" size="14"></th-icon><span>Reset</span></button>',
        '        </div>',
        '      </div>',
        '      <div class="filter-bar-grid">',
        '        <div class="filter-field">',
        '          <label class="filter-label">Competition Scope</label>',
        '          <select class="form-control form-control-sm" ng-model="vm.filters.competition_id" ng-change="vm.load()">',
        '            <option value="">All Competitions</option>',
        '            <option ng-repeat="c in vm.competitions" value="{{ c.id }}">{{ c.title }}</option>',
        '          </select>',
        '        </div>',
        '        <div class="filter-field-search">',
        '          <label class="filter-label">Search Recent Audit Activity</label>',
        '          <div class="search-input-wrap">',
        '            <th-icon name="search" size="15"></th-icon>',
        '            <input type="text" class="form-control form-control-sm" ng-model="vm.filters.audit_q" ng-model-options="{ debounce: 250 }" ng-change="vm.load()" placeholder="Search actor, action, or entity ID..." />',
        '          </div>',
        '        </div>',
        '        <div class="filter-field">',
        '          <label class="filter-label">Audit Entity Type</label>',
        '          <select class="form-control form-control-sm" ng-model="vm.filters.audit_entity" ng-change="vm.load()">',
        '            <option value="">All Entities</option>',
        '            <option value="competition">competition</option>',
        '            <option value="category">category</option>',
        '            <option value="round">round</option>',
        '            <option value="application">application</option>',
        '            <option value="nominee">nominee</option>',
        '            <option value="sponsor">sponsor</option>',
        '            <option value="partner">partner</option>',
        '            <option value="partnership_inquiry">partnership_inquiry</option>',
        '            <option value="order">order</option>',
        '            <option value="payment">payment</option>',
        '            <option value="vote_ledger">vote_ledger</option>',
        '            <option value="user">user</option>',
        '            <option value="settings">settings</option>',
        '          </select>',
        '        </div>',
        '      </div>',
        '    </div>',

        '    <div ng-if="vm.loading" class="loading-box">Loading platform KPIs...</div>',
        '    <div ng-if="vm.data">',
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
        '          <table class="data-table" th-datatable dt-data="vm.data.recent_audit_logs" dt-row="a" dt-page-length="10" dt-empty="No audited actions match the selected filters.">',
        '            <thead><tr><th dt-sort="a.created_at">Timestamp</th><th dt-sort="a.actor_name">Actor</th><th dt-sort="a.action">Action</th><th dt-sort="a.entity_type">Entity</th></tr></thead>',
        '            <tbody>',
        '              <tr>',
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
