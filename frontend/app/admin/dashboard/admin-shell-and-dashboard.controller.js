(function () {
  'use strict';

  var savedAdminScrollTop = 0;

  var ADMIN_NAV_META = {
    '/admin': { label: 'Platform Operations Overview', icon: 'dashboard' },
    '/admin/accounting': { label: 'Accounting Hub', icon: 'credit-card' },
    '/admin/accounting/transactions': { label: 'Financial Records', icon: 'receipt' },
    '/admin/accounting/payouts': { label: 'Prize Disbursements', icon: 'trophy' },
    '/admin/competitions': { label: 'Competitions', icon: 'trophy' },
    '/admin/categories': { label: 'Categories', icon: 'layers' },
    '/admin/rounds': { label: 'Rounds & Packages', icon: 'clock' },
    '/admin/submissions': { label: 'Review Queue', icon: 'clipboard-check' },
    '/admin/nominees': { label: 'Nominees', icon: 'award' },
    '/admin/votes': { label: 'Vote Ledger', icon: 'book-ledger' },
    '/admin/orders': { label: 'Orders', icon: 'receipt' },
    '/admin/reconciliation': { label: 'Payments & Reconcile', icon: 'credit-card' },
    '/admin/eliminations': { label: 'Eliminations', icon: 'target' },
    '/admin/sponsors-partners': { label: 'Sponsors, Partners & Supporters', icon: 'handshake' },
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
        '    <a ng-if="$ctrl.perms.canManageCompetition() || $ctrl.perms.canModerate() || $ctrl.perms.canFinance()" href="/admin/sponsors-partners" ng-click="$ctrl.drawerOpen=false" ng-class="{active: $ctrl.is(\'/admin/sponsors-partners\')}"><th-icon name="handshake" size="17"></th-icon><span>Sponsors, Partners &amp; Supporters</span></a>',
        '    <a ng-if="$ctrl.perms.canModerate() || $ctrl.perms.canFinance()" href="/admin/moderation" ng-click="$ctrl.drawerOpen=false" ng-class="{active: $ctrl.is(\'/admin/moderation\')}"><th-icon name="shield-alert" size="17"></th-icon><span>Moderation &amp; Support</span></a>',

        '    <div class="side-nav-section-label" ng-if="$ctrl.perms.canFinance()">Accounting &amp; Finance</div>',
        '    <a ng-if="$ctrl.perms.canFinance()" href="/admin/accounting" ng-click="$ctrl.drawerOpen=false" ng-class="{active: $ctrl.is(\'/admin/accounting\')}"><th-icon name="credit-card" size="17"></th-icon><span>Financial Hub</span></a>',
        '    <a ng-if="$ctrl.perms.canFinance()" href="/admin/accounting/transactions" ng-click="$ctrl.drawerOpen=false" ng-class="{active: $ctrl.is(\'/admin/accounting/transactions\')}"><th-icon name="receipt" size="17"></th-icon><span>Financial Records</span></a>',
        '    <a ng-if="$ctrl.perms.canFinance()" href="/admin/accounting/payouts" ng-click="$ctrl.drawerOpen=false" ng-class="{active: $ctrl.is(\'/admin/accounting/payouts\')}"><th-icon name="trophy" size="17"></th-icon><span>Prize Disbursements</span></a>',
        '    <a ng-if="$ctrl.perms.canFinance()" href="/admin/reconciliation" ng-click="$ctrl.drawerOpen=false" ng-class="{active: $ctrl.is(\'/admin/reconciliation\')}"><th-icon name="credit-card" size="17"></th-icon><span>Payments &amp; Reconcile</span></a>',
        '    <a ng-if="$ctrl.perms.canFinance()" href="/admin/orders" ng-click="$ctrl.drawerOpen=false" ng-class="{active: $ctrl.is(\'/admin/orders\')}"><th-icon name="receipt" size="17"></th-icon><span>Orders</span></a>',
        '    <a ng-if="$ctrl.perms.canFinance()" href="/admin/votes" ng-click="$ctrl.drawerOpen=false" ng-class="{active: $ctrl.is(\'/admin/votes\')}"><th-icon name="book-ledger" size="17"></th-icon><span>Vote Ledger</span></a>',
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
        '      <a href="/" class="side-nav-footer-btn btn-home" title="View Public Website" aria-label="Public Website">',
        '        <th-icon name="home" size="17"></th-icon>',
        '      </a>',
        '      <a href="/portal/dashboard" class="side-nav-footer-btn btn-portal" title="Go to Contestant Portal" aria-label="My Portal">',
        '        <th-icon name="user" size="17"></th-icon>',
        '      </a>',
        '      <a ng-if="$ctrl.perms.canManageCompetition()" href="/admin/settings" class="side-nav-footer-btn btn-settings" title="Platform Settings" aria-label="Platform Settings">',
        '        <th-icon name="settings" size="17"></th-icon>',
        '      </a>',
        '      <button type="button" class="side-nav-footer-btn btn-signout" ng-click="$ctrl.promptLogout()" title="Sign Out" aria-label="Sign Out">',
        '        <th-icon name="log-out" size="17"></th-icon>',
        '      </button>',
        '    </div>',
        '    <div class="side-nav-version-tag">',
        '      <span>StageLight Admin</span>',
        '      <span>&bull;</span>',
        '      <span class="status-online">&#9679; v1.0 Live</span>',
        '    </div>',
        '  </div>',
        '  <!-- Sign Out Confirmation Modal -->',
        '  <div ng-if="$ctrl.showLogoutModal">',
        '    <div class="modal-backdrop" ng-click="$ctrl.showLogoutModal = false"></div>',
        '    <div class="modal-dialog" style="max-width:420px;padding:0;" role="dialog" aria-modal="true">',
        '      <div class="modal-header">',
        '        <h3 style="margin:0;display:flex;align-items:center;gap:8px;font-size:1.15rem;">',
        '          <th-icon name="log-out" size="18" style="color:#e11d48;"></th-icon>',
        '          <span>Sign Out</span>',
        '        </h3>',
        '        <button type="button" class="btn-close" ng-click="$ctrl.showLogoutModal = false" aria-label="Close" style="background:none;border:none;cursor:pointer;font-size:1.3rem;color:var(--text-muted);">&times;</button>',
        '      </div>',
        '      <div class="modal-body" style="padding:20px;">',
        '        <p style="margin:0 0 8px;font-size:0.95rem;color:var(--text-main);">',
        '          Are you sure you want to sign out, <strong>{{ $ctrl.user.full_name }}</strong>?',
        '        </p>',
        '        <p class="muted" style="margin:0;font-size:0.85rem;">',
        '          Your current administrator session will be securely terminated.',
        '        </p>',
        '      </div>',
        '      <div class="modal-footer" style="padding:12px 20px;display:flex;justify-content:flex-end;gap:10px;">',
        '        <button type="button" class="btn btn-secondary" ng-click="$ctrl.showLogoutModal = false">Cancel</button>',
        '        <button type="button" class="btn btn-danger" ng-click="$ctrl.confirmLogout()">',
        '          <th-icon name="log-out" size="14"></th-icon>',
        '          <span>Sign Out</span>',
        '        </button>',
        '      </div>',
        '    </div>',
        '  </div>',
        '</aside>'
      ].join(''),
      controller: ['$scope', '$location', '$element', '$timeout', 'AuthService', 'PermissionsService',
        function ($scope, $location, $element, $timeout, AuthService, PermissionsService) {
          var vm = this;
          vm.auth = AuthService;
          vm.perms = PermissionsService;
          vm.drawerOpen = false;
          vm.user = AuthService.state.user;

          $scope.$watch(function () {
            return AuthService.state.user;
          }, function (u) {
            vm.user = u;
          });

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

          vm.showLogoutModal = false;
          vm.promptLogout = function () {
            vm.showLogoutModal = true;
          };
          vm.confirmLogout = function () {
            vm.showLogoutModal = false;
            AuthService.logout('/portal/login');
          };
          vm.logout = vm.promptLogout;

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
    .controller('AdminDashboardController', ['$rootScope', '$scope', '$window', '$timeout', 'ApiService', 'PermissionsService', 'ToastService', 'AdminFilterUtils',
      function ($rootScope, $scope, $window, $timeout, ApiService, PermissionsService, ToastService, AdminFilterUtils) {
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
        vm.chartMetric = 'revenue';

        var trendChartInstance = null;
        var catChartInstance = null;
        var channelChartInstance = null;

        function destroyCharts() {
          if (trendChartInstance) { trendChartInstance.destroy(); trendChartInstance = null; }
          if (catChartInstance) { catChartInstance.destroy(); catChartInstance = null; }
          if (channelChartInstance) { channelChartInstance.destroy(); channelChartInstance = null; }
        }

        vm.setMetric = function (m) {
          vm.chartMetric = m;
          renderCharts();
        };

        function renderCharts() {
          if (!vm.data || !vm.data.chart_analytics || !$window.Chart) return;
          var analytics = vm.data.chart_analytics;
          var isRev = vm.chartMetric === 'revenue';

          // 1. Trend chart
          var trendCanvas = document.getElementById('adminRevenueTrendChart');
          if (trendCanvas) {
            if (trendChartInstance) trendChartInstance.destroy();
            var trendList = analytics.revenue_trend || [];
            var labels = trendList.map(function (d) {
              var p = d.date.split('-');
              return p.length === 3 ? (p[1] + '/' + p[2]) : d.date;
            });
            var vals = trendList.map(function (d) { return isRev ? d.gross_ghs : d.votes; });
            trendChartInstance = new $window.Chart(trendCanvas.getContext('2d'), {
              type: isRev ? 'line' : 'bar',
              data: {
                labels: labels.length ? labels : ['Today'],
                datasets: [{
                  label: isRev ? 'Verified Collections (GHS)' : 'Daily Verified Votes',
                  data: vals.length ? vals : [0],
                  borderColor: isRev ? '#f59e0b' : '#a855f7',
                  backgroundColor: isRev ? 'rgba(245, 158, 11, 0.16)' : 'rgba(168, 85, 247, 0.22)',
                  fill: true,
                  tension: 0.35,
                  borderWidth: 2,
                  pointRadius: 3.5,
                  pointHoverRadius: 6,
                  pointBackgroundColor: isRev ? '#f59e0b' : '#a855f7',
                  borderRadius: 6
                }]
              },
              options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: { display: false },
                  tooltip: {
                    callbacks: {
                      label: function (ctx) {
                        return (isRev ? 'GHS ' : '') + ctx.parsed.y.toLocaleString() + (!isRev ? ' votes' : '');
                      }
                    }
                  }
                },
                scales: {
                  y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: {
                      color: '#9ca3af',
                      callback: function (v) { return isRev ? ('GHS ' + v) : v; }
                    }
                  },
                  x: {
                    grid: { display: false },
                    ticks: { color: '#9ca3af' }
                  }
                }
              }
            });
          }

          // 2. Category distribution
          var catCanvas = document.getElementById('adminCategoryChart');
          if (catCanvas) {
            if (catChartInstance) catChartInstance.destroy();
            var cats = analytics.category_distribution || [];
            var catLabels = cats.map(function (c) { return c.category_name; });
            var catVals = cats.map(function (c) { return isRev ? c.revenue_ghs : c.votes; });
            catChartInstance = new $window.Chart(catCanvas.getContext('2d'), {
              type: 'doughnut',
              data: {
                labels: catLabels.length ? catLabels : ['Auditions'],
                datasets: [{
                  data: catVals.length ? catVals : [1],
                  backgroundColor: ['#f59e0b', '#3b82f6', '#10b981', '#ec4899', '#8b5cf6', '#06b6d4'],
                  borderWidth: 0
                }]
              },
              options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: { position: 'bottom', labels: { boxWidth: 10, color: '#d1d5db', font: { size: 10 } } },
                  tooltip: {
                    callbacks: {
                      label: function (ctx) {
                        return ' ' + ctx.label + ': ' + (isRev ? 'GHS ' : '') + ctx.parsed.toLocaleString() + (!isRev ? ' votes' : '');
                      }
                    }
                  }
                },
                cutout: '65%'
              }
            });
          }

          // 3. Channel breakdown
          var chCanvas = document.getElementById('adminChannelChart');
          if (chCanvas) {
            if (channelChartInstance) channelChartInstance.destroy();
            var chs = analytics.channel_breakdown || [];
            var chLabels = chs.map(function (ch) { return ch.channel_label; });
            var chVals = chs.map(function (ch) { return ch.amount_ghs; });
            channelChartInstance = new $window.Chart(chCanvas.getContext('2d'), {
              type: 'doughnut',
              data: {
                labels: chLabels.length ? chLabels : ['Mobile Money'],
                datasets: [{
                  data: chVals.length ? chVals : [1],
                  backgroundColor: ['#eab308', '#38bdf8', '#6366f1', '#10b981'],
                  borderWidth: 0
                }]
              },
              options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: { position: 'bottom', labels: { boxWidth: 10, color: '#d1d5db', font: { size: 10 } } },
                  tooltip: {
                    callbacks: {
                      label: function (ctx) {
                        return ' ' + ctx.label + ': GHS ' + ctx.parsed.toLocaleString();
                      }
                    }
                  }
                },
                cutout: '65%'
              }
            });
          }
        }

        function onWindowResize() {
          if (revChartInstance) revChartInstance.resize();
          if (catChartInstance) catChartInstance.resize();
          if (channelChartInstance) channelChartInstance.resize();
        }
        angular.element($window).on('resize', onWindowResize);

        $scope.$on('$destroy', function () {
          angular.element($window).off('resize', onWindowResize);
          destroyCharts();
        });

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
            $timeout(renderCharts, 60);
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
        '  <div class="admin-dashboard-page">',
        '    <div class="flex-between mb-2 admin-page-header">',
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
        '      <div class="admin-kpi-grid mb-3">',
        '        <div class="kpi-card"><div class="kpi-label">Applications</div><div class="kpi-value">{{ vm.data.kpis.total_applications }}</div><div class="kpi-sub">{{ vm.data.kpis.pending_reviews }} awaiting review</div></div>',
        '        <div class="kpi-card"><div class="kpi-label">Active Nominees</div><div class="kpi-value">{{ vm.data.kpis.active_nominees }}</div><div class="kpi-sub">{{ vm.data.kpis.active_rounds_count }} open round(s)</div></div>',
        '        <div class="kpi-card"><div class="kpi-label">Ledger Valid Votes</div><div class="kpi-value">{{ vm.data.kpis.total_valid_votes | number }}</div><div class="kpi-sub">{{ vm.data.kpis.quarantined_payments }} quarantined tx</div></div>',
        '        <div class="kpi-card"><div class="kpi-label">Net Verified Collections</div><div class="kpi-value">{{ vm.data.kpis.net_collections_major | ghsCurrency:"GHS" }}</div><div class="kpi-sub">Refunds: {{ vm.data.kpis.refunded_major | ghsCurrency:"GHS" }}</div></div>',
        '      </div>',
        '',
        '      <!-- PLATFORM OPERATIONS & FINANCIAL CHARTS -->',
        '      <div class="card mb-3 admin-charts-card">',
        '        <div class="flex-between mb-2 admin-charts-header">',
        '          <div>',
        '            <h3 style="margin:0;display:flex;align-items:center;gap:8px;">',
        '              <th-icon name="bar-chart" size="18"></th-icon>',
        '              <span>Platform Operations &amp; Revenue Analytics</span>',
        '            </h3>',
        '            <p class="muted" style="margin:3px 0 0;font-size:0.86rem;">Interactive verified collections timeline, category engagement share, and settlement channel distribution.</p>',
        '          </div>',
        '          <div class="inline-actions admin-charts-actions">',
        '            <div class="btn-group">',
        '              <button type="button" class="btn btn-sm" ng-class="{\'btn-primary\': vm.chartMetric === \'revenue\', \'btn-secondary\': vm.chartMetric !== \'revenue\'}" ng-click="vm.setMetric(\'revenue\')">Collections (GHS)</button>',
        '              <button type="button" class="btn btn-sm" ng-class="{\'btn-primary\': vm.chartMetric === \'votes\', \'btn-secondary\': vm.chartMetric !== \'votes\'}" ng-click="vm.setMetric(\'votes\')">Vote Volume</button>',
        '            </div>',
        '            <a ng-if="vm.perms.canFinance()" href="/admin/accounting" class="btn btn-sm btn-secondary"><th-icon name="credit-card" size="14"></th-icon><span>Accounting Center &rarr;</span></a>',
        '          </div>',
        '        </div>',
        '        <div class="admin-charts-grid">',
        '          <div class="chart-panel chart-panel-timeline">',
        '            <div class="flex-between mb-2">',
        '              <strong style="font-size:0.86rem;color:var(--text-main);"><th-icon name="bar-chart" size="14"></th-icon><span>{{ vm.chartMetric === "revenue" ? "14-Day Collections Timeline (GHS)" : "14-Day Verified Vote Activity" }}</span></strong>',
        '              <span class="muted" style="font-size:0.75rem;">Daily Verified</span>',
        '            </div>',
        '            <div class="chart-canvas-wrap">',
        '              <canvas id="adminRevenueTrendChart"></canvas>',
        '            </div>',
        '          </div>',
        '          <div class="chart-panel chart-panel-category">',
        '            <div class="flex-between mb-2">',
        '              <strong style="font-size:0.86rem;color:var(--text-main);"><th-icon name="pie-chart" size="14"></th-icon><span>Category Share</span></strong>',
        '              <span class="muted" style="font-size:0.75rem;">Discipline</span>',
        '            </div>',
        '            <div class="chart-canvas-wrap">',
        '              <canvas id="adminCategoryChart"></canvas>',
        '            </div>',
        '          </div>',
        '          <div class="chart-panel chart-panel-channel">',
        '            <div class="flex-between mb-2">',
        '              <strong style="font-size:0.86rem;color:var(--text-main);"><th-icon name="credit-card" size="14"></th-icon><span>Settlement Channels</span></strong>',
        '              <span class="muted" style="font-size:0.75rem;">Payment Mix</span>',
        '            </div>',
        '            <div class="chart-canvas-wrap">',
        '              <canvas id="adminChannelChart"></canvas>',
        '            </div>',
        '          </div>',
        '        </div>',
        '      </div>',
        '',
        '      <!-- SPONSORS, PARTNERS & SUPPORTERS ECOSYSTEM -->',
        '      <div class="card mb-3">',
        '        <div class="flex-between mb-2 admin-ecosystem-header">',
        '          <div>',
        '            <h3 style="margin:0;display:flex;align-items:center;gap:8px;">',
        '              <th-icon name="handshake" size="18"></th-icon>',
        '              <span>Sponsors, Partners &amp; Supporters Ecosystem</span>',
        '            </h3>',
        '            <p class="muted" style="margin:3px 0 0;font-size:0.86rem;">Official Headline &amp; Season Sponsors, Strategic Ecosystem Partners, Backstage Supporters, and Open Brand Inquiries.</p>',
        '          </div>',
        '          <div class="inline-actions admin-ecosystem-actions">',
        '            <a href="/sponsors" target="_blank" class="btn btn-sm btn-secondary"><span>Public /sponsors</span><th-icon name="external-link" size="13"></th-icon></a>',
        '            <a href="/partners" target="_blank" class="btn btn-sm btn-secondary"><span>Public /partners</span><th-icon name="external-link" size="13"></th-icon></a>',
        '            <a href="/admin/sponsors-partners" class="btn btn-sm btn-primary"><th-icon name="sliders" size="14"></th-icon><span>Manage Directory &rarr;</span></a>',
        '          </div>',
        '        </div>',
        '        <div class="admin-mini-kpi-grid mb-2">',
        '          <div class="kpi-mini-card"><div class="kpi-label">Official Sponsors</div><div class="kpi-value">{{ vm.data.kpis.active_sponsors || 0 }}</div><div class="kpi-sub">Title, Platinum &amp; Gold tiers</div></div>',
        '          <div class="kpi-mini-card"><div class="kpi-label">Strategic Partners</div><div class="kpi-value">{{ vm.data.kpis.active_partners || 0 }}</div><div class="kpi-sub">Broadcasters, Fintech &amp; Venues</div></div>',
        '          <div class="kpi-mini-card"><div class="kpi-label">Active Supporters</div><div class="kpi-value">{{ vm.data.kpis.active_supporters || 0 }}</div><div class="kpi-sub">Regional &amp; Backstage champions</div></div>',
        '          <div class="kpi-mini-card"><div class="kpi-label">Open Inquiries</div><div class="kpi-value">{{ vm.data.kpis.open_partnership_inquiries || 0 }}</div><div class="kpi-sub"><a href="/admin/sponsors-partners?tab=inquiries" style="color:var(--accent);">Review new brand leads &rarr;</a></div></div>',
        '        </div>',
        '        <div class="sp-dashboard-chips" ng-if="vm.data.sponsors_partners_summary && vm.data.sponsors_partners_summary.length">',
        '          <a ng-repeat="org in vm.data.sponsors_partners_summary" ng-href="/admin/sponsors-partners" class="sp-dashboard-chip" title="{{ org.badge_label || org.name }}">',
        '            <th-brand-mark org="org" size="xs"></th-brand-mark>',
        '            <span>{{ org.name }}</span>',
        '            <span class="sp-chip-tag" ng-class="{\'sp-chip-sponsor\': org.kind === \'SPONSOR\' && org.tier_or_category !== \'SUPPORTING\', \'sp-chip-partner\': org.kind === \'PARTNER\', \'sp-chip-supporter\': org.kind === \'SUPPORTER\' || org.tier_or_category === \'SUPPORTING\'}">{{ (org.kind === "SUPPORTER" || org.tier_or_category === "SUPPORTING") ? "Supporter" : (org.kind === "SPONSOR" ? "Sponsor" : "Partner") }}</span>',
        '          </a>',
        '        </div>',
        '      </div>',

        '      <div class="card mb-3" ng-if="vm.perms.canManageCompetition()">',
        '        <h3 style="margin-top:0;">Emergency Incident &amp; Voting Control</h3>',
        '        <div class="inline-actions admin-pause-bar">',
        '          <input type="text" class="form-control admin-pause-input" ng-model="vm.pauseForm.incident_message" placeholder="Incident banner text (optional)..." />',
        '          <div class="admin-pause-actions">',
        '            <button type="button" class="btn btn-danger" ng-click="vm.applyPause(true)">Pause Global Voting</button>',
        '            <button type="button" class="btn btn-success" ng-click="vm.applyPause(false)">Resume Voting</button>',
        '          </div>',
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
