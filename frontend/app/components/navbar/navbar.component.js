(function () {
  'use strict';

  var ADMIN_PAGES = [
    { path: '/admin', label: 'KPI Overview', icon: 'dashboard', section: 'Overview' },
    { path: '/admin/competitions', label: 'Competitions', icon: 'trophy', section: 'Competition Setup' },
    { path: '/admin/categories', label: 'Categories', icon: 'layers', section: 'Competition Setup' },
    { path: '/admin/rounds', label: 'Rounds & Packages', icon: 'clock', section: 'Competition Setup' },
    { path: '/admin/eliminations', label: 'Eliminations', icon: 'target', section: 'Competition Setup' },
    { path: '/admin/submissions', label: 'Review Queue', icon: 'clipboard-check', section: 'Talent & Trust' },
    { path: '/admin/nominees', label: 'Nominees', icon: 'award', section: 'Talent & Trust' },
    { path: '/admin/sponsors-partners', label: 'Sponsors & Partners', icon: 'handshake', section: 'Talent & Trust' },
    { path: '/admin/moderation', label: 'Moderation & Support', icon: 'shield-alert', section: 'Talent & Trust' },
    { path: '/admin/votes', label: 'Vote Ledger', icon: 'book-ledger', section: 'Finance & Ledger' },
    { path: '/admin/orders', label: 'Orders', icon: 'receipt', section: 'Finance & Ledger' },
    { path: '/admin/reconciliation', label: 'Payments & Reconcile', icon: 'credit-card', section: 'Finance & Ledger' },
    { path: '/admin/reports', label: 'Reports & CSV', icon: 'pie-chart', section: 'Finance & Ledger' },
    { path: '/admin/audit-logs', label: 'Audit Logs', icon: 'history', section: 'Finance & Ledger' },
    { path: '/admin/users', label: 'Users & Roles', icon: 'users', section: 'Administration' },
    { path: '/admin/settings', label: 'Platform Settings', icon: 'settings', section: 'Administration' }
  ];

  var ADMIN_MAP = {};
  ADMIN_PAGES.forEach(function (item) {
    ADMIN_MAP[item.path] = item;
  });

  angular.module('talentHuntApp')
    .component('thNavbar', {
      template: [
        '<!-- DEDICATED MODERN ADMIN TOPNAV -->',
        '<header class="admin-navbar" ng-if="$ctrl.isAdmin" role="banner">',
        '  <div class="admin-navbar-bar">',
        '    <div class="admin-navbar-inner">',
        '      <!-- Left: Mobile Toggle, Admin Brand & Streamlined Breadcrumb -->',
        '      <div class="admin-nav-left">',
        '        <button type="button" class="admin-mobile-toggle" ng-click="$ctrl.toggleSidebarDrawer()" aria-label="Toggle Admin Sidebar Menu">',
        '          <th-icon name="menu" size="18"></th-icon>',
        '        </button>',
        '        <a href="/admin" class="admin-brand-pill" title="StageLight Admin Console">',
        '          <span class="admin-brand-icon"><th-icon name="shield" size="14"></th-icon></span>',
        '          <span class="admin-brand-text">StageLight <span class="admin-brand-badge">Admin</span></span>',
        '        </a>',
        '        <div class="admin-breadcrumbs">',
        '          <span class="admin-bc-sep">/</span>',
        '          <span class="admin-bc-page">',
        '            <th-icon name="{{ $ctrl.adminPageIcon }}" size="13"></th-icon>',
        '            <span>{{ $ctrl.adminPageTitle }}</span>',
        '          </span>',
        '        </div>',
        '      </div>',
        '',
        '      <!-- Center: Compact Quick Jump Search -->',
        '      <div class="admin-nav-search-wrap">',
        '        <div class="admin-nav-search-box">',
        '          <th-icon name="search" size="13"></th-icon>',
        '          <input type="text"',
        '                 id="adminGlobalSearchInput"',
        '                 class="admin-nav-search-input"',
        '                 ng-model="$ctrl.searchQuery"',
        '                 ng-focus="$ctrl.onSearchFocus()"',
        '                 ng-change="$ctrl.onSearchInput()"',
        '                 ng-blur="$ctrl.onSearchBlur()"',
        '                 ng-keydown="$ctrl.onSearchKey($event)"',
        '                 placeholder="Search console... ( / )" />',
        '          <span class="admin-search-kbd">/</span>',
        '        </div>',
        '        <div class="admin-search-dropdown" ng-if="$ctrl.searchActive && $ctrl.filteredNav.length">',
        '          <div class="admin-search-item"',
        '               ng-repeat="item in $ctrl.filteredNav"',
        '               ng-mousedown="$ctrl.navigateTo(item.path)">',
        '            <th-icon name="{{ item.icon }}" size="14"></th-icon>',
        '            <div>',
        '              <div class="admin-search-label">{{ item.label }}</div>',
        '              <div class="admin-search-sub">{{ item.section }} &bull; {{ item.path }}</div>',
        '            </div>',
        '          </div>',
        '        </div>',
        '      </div>',
        '',
        '      <!-- Right: Minimalist Status & Profile -->',
        '      <div class="admin-nav-right">',
        '        <div class="admin-env-pill" title="Sandbox Environment: Mock Payment & Verification Gateway Active">',
        '          <span class="admin-env-dot"></span>',
        '          <span>Live GHS</span>',
        '        </div>',
        '',
        '        <div class="admin-profile-pill" ng-if="$ctrl.auth.isAuthenticated()" title="{{ $ctrl.auth.state.user.full_name }} ({{ $ctrl.primaryRole() }})">',
        '          <div class="admin-profile-avatar">{{ $ctrl.auth.state.user.full_name | initials }}</div>',
        '          <span class="admin-profile-name">{{ $ctrl.auth.state.user.full_name.split(" ")[0] }}</span>',
        '          <button type="button" class="admin-logout-btn" ng-click="$ctrl.logout()" title="Sign Out">',
        '            <th-icon name="log-out" size="13"></th-icon>',
        '          </button>',
        '        </div>',
        '      </div>',
        '    </div>',
        '  </div>',
        '</header>',

        '<!-- PUBLIC WEBSITE NAVBAR -->',
        '<header class="site-navbar" ng-if="!$ctrl.isAdmin" role="banner">',
        '  <div class="navbar-fixed-bar">',
        '    <div class="incident-banner" ng-if="$ctrl.incident && $ctrl.incident.message">',
        '      &#9888; {{ $ctrl.incident.message }}',
        '    </div>',
        '    <div class="container navbar-inner">',
        '      <a href="/" class="brand-logo" ng-click="$ctrl.menuOpen = false">',
        '        <span class="brand-mark">SL</span>',
        '        <span>StageLight</span>',
        '        <span class="ghana-stripe" title="Ghana"><span class="gh-r"></span><span class="gh-y"></span><span class="gh-g"></span></span>',
        '      </a>',
        '      <nav class="nav-links" aria-label="Primary Navigation">',
        '        <a href="/" ng-class="{active: $ctrl.isActive(\'/\')}"><th-icon name="home" size="16"></th-icon><span>Home</span></a>',
        '        <a href="/competitions" ng-class="{active: $ctrl.startsWith(\'/competitions\')}"><th-icon name="trophy" size="16"></th-icon><span>Competitions</span></a>',
        '        <a href="/nominees" ng-class="{active: $ctrl.startsWith(\'/nominee\')}"><th-icon name="star" size="16"></th-icon><span>Nominees</span></a>',
        '        <a href="/results" ng-class="{active: $ctrl.startsWith(\'/results\')}"><th-icon name="bar-chart" size="16"></th-icon><span>Results</span></a>',
        '        <a href="/sponsors" ng-class="{active: $ctrl.startsWith(\'/sponsors\')}"><th-icon name="gem" size="16"></th-icon><span>Sponsors</span></a>',
        '        <a href="/partners" ng-class="{active: $ctrl.startsWith(\'/partners\')}"><th-icon name="handshake" size="16"></th-icon><span>Partners</span></a>',
        '      </nav>',
        '      <div class="nav-actions">',
        '        <a ng-if="!$ctrl.auth.isAuthenticated()" href="/portal/login" class="btn btn-sm btn-outline-light"><th-icon name="log-in" size="15"></th-icon><span>Sign In</span></a>',
        '        <a ng-if="!$ctrl.auth.isAuthenticated()" href="/portal/register" class="btn btn-sm btn-gold"><th-icon name="mic" size="15"></th-icon><span>Submit Talent</span></a>',
        '        <a ng-if="$ctrl.auth.isAuthenticated() && $ctrl.perms.isNominee()" href="/portal/voting" class="btn btn-sm btn-gold"><th-icon name="vote" size="15"></th-icon><span>My Votes</span></a>',
        '        <a ng-if="$ctrl.auth.isAuthenticated()" href="/portal/dashboard" class="btn btn-sm btn-outline-light" ng-class="{\'nav-btn-active\': $ctrl.startsWith(\'/portal\')}"><th-icon name="user" size="15"></th-icon><span>Portal ({{ $ctrl.auth.state.user.full_name.split(" ")[0] }})</span></a>',
        '        <a ng-if="$ctrl.auth.isAuthenticated() && $ctrl.perms.canAccessAdmin()" href="/admin" class="btn btn-sm btn-primary" ng-class="{\'nav-btn-active-admin\': $ctrl.startsWith(\'/admin\')}"><th-icon name="shield" size="15"></th-icon><span>Admin</span></a>',
        '        <button ng-if="$ctrl.auth.isAuthenticated()" type="button" class="btn btn-sm btn-outline-light" ng-click="$ctrl.logout()"><th-icon name="log-out" size="15"></th-icon><span>Sign Out</span></button>',
        '      </div>',
        '      <button type="button" class="mobile-menu-btn" ng-click="$ctrl.menuOpen = !$ctrl.menuOpen" aria-expanded="{{ $ctrl.menuOpen }}">',
        '        <th-icon name="{{ $ctrl.menuOpen ? \'x\' : \'menu\' }}" size="16"></th-icon>',
        '        <span>{{ $ctrl.menuOpen ? "Close" : "Menu" }}</span>',
        '      </button>',
        '    </div>',
        '  </div>',
        '  <div class="mobile-drawer" ng-if="$ctrl.menuOpen">',
        '    <a href="/" ng-click="$ctrl.menuOpen=false" ng-class="{active: $ctrl.isActive(\'/\')}"><th-icon name="home" size="17"></th-icon><span>Home</span></a>',
        '    <a href="/competitions" ng-click="$ctrl.menuOpen=false" ng-class="{active: $ctrl.startsWith(\'/competitions\')}"><th-icon name="trophy" size="17"></th-icon><span>Competitions</span></a>',
        '    <a href="/nominees" ng-click="$ctrl.menuOpen=false" ng-class="{active: $ctrl.startsWith(\'/nominee\')}"><th-icon name="star" size="17"></th-icon><span>Nominees &amp; Vote</span></a>',
        '    <a href="/results" ng-click="$ctrl.menuOpen=false" ng-class="{active: $ctrl.startsWith(\'/results\')}"><th-icon name="bar-chart" size="17"></th-icon><span>Published Results</span></a>',
        '    <a href="/sponsors" ng-click="$ctrl.menuOpen=false" ng-class="{active: $ctrl.startsWith(\'/sponsors\')}"><th-icon name="gem" size="17"></th-icon><span>Official Sponsors</span></a>',
        '    <a href="/partners" ng-click="$ctrl.menuOpen=false" ng-class="{active: $ctrl.startsWith(\'/partners\')}"><th-icon name="handshake" size="17"></th-icon><span>Strategic Partners</span></a>',
        '    <a href="/how-it-works" ng-click="$ctrl.menuOpen=false" ng-class="{active: $ctrl.isActive(\'/how-it-works\')}"><th-icon name="compass" size="17"></th-icon><span>How It Works</span></a>',
        '    <div class="mobile-drawer-divider"></div>',
        '    <a ng-if="!$ctrl.auth.isAuthenticated()" href="/portal/login" ng-click="$ctrl.menuOpen=false"><th-icon name="log-in" size="17"></th-icon><span>Sign In</span></a>',
        '    <a ng-if="!$ctrl.auth.isAuthenticated()" href="/portal/register" ng-click="$ctrl.menuOpen=false"><th-icon name="mic" size="17"></th-icon><span>Register / Submit Talent</span></a>',
        '    <a ng-if="$ctrl.auth.isAuthenticated()" href="/portal/dashboard" ng-click="$ctrl.menuOpen=false"><th-icon name="user" size="17"></th-icon><span>My Portal Dashboard</span></a>',
        '    <a ng-if="$ctrl.auth.isAuthenticated() && $ctrl.perms.isNominee()" href="/portal/voting" ng-click="$ctrl.menuOpen=false"><th-icon name="vote" size="17"></th-icon><span>Nominee Voting Dashboard</span></a>',
        '    <a ng-if="$ctrl.auth.isAuthenticated() && $ctrl.perms.canAccessAdmin()" href="/admin" ng-click="$ctrl.menuOpen=false"><th-icon name="shield" size="17"></th-icon><span>Admin Console</span></a>',
        '    <button ng-if="$ctrl.auth.isAuthenticated()" type="button" class="btn btn-sm btn-outline-light mt-1" ng-click="$ctrl.logout()"><th-icon name="log-out" size="15"></th-icon><span>Sign Out</span></button>',
        '  </div>',
        '</header>'
      ].join(''),
      controller: ['$location', '$element', '$timeout', '$window', '$scope', '$rootScope', 'AuthService', 'PermissionsService', 'ApiService', 'ToastService',
        function ($location, $element, $timeout, $window, $scope, $rootScope, AuthService, PermissionsService, ApiService, ToastService) {
          var vm = this;
          vm.auth = AuthService;
          vm.perms = PermissionsService;
          vm.menuOpen = false;
          vm.incident = null;
          vm.isAdmin = false;
          vm.searchQuery = '';
          vm.searchActive = false;
          vm.filteredNav = [];

          function updateAdminState() {
            var p = $location.path() || '/';
            vm.isAdmin = p === '/admin' || p.indexOf('/admin/') === 0;
            var meta = ADMIN_MAP[p] || { label: 'Admin Console', icon: 'shield', section: 'Overview' };
            vm.adminPageTitle = meta.label;
            vm.adminPageIcon = meta.icon;
            vm.adminSection = meta.section;
          }

          function syncNavbarHeight() {
            $timeout(function () {
              var bar = $element[0] && ($element[0].querySelector('.admin-navbar-bar') || $element[0].querySelector('.navbar-fixed-bar'));
              if (bar && bar.offsetHeight) {
                document.documentElement.style.setProperty('--navbar-height', (bar.offsetHeight + 1) + 'px');
              }
            }, 0, false);
          }

          function fetchIncident() {
            ApiService.get('/public/info').then(function (res) {
              vm.incident = res.data.incident_banner;
              syncNavbarHeight();
            });
          }

          vm.onSearchFocus = function () {
            vm.searchActive = true;
            vm.onSearchInput();
          };

          vm.onSearchInput = function () {
            var q = (vm.searchQuery || '').trim().toLowerCase();
            if (!q) {
              vm.filteredNav = ADMIN_PAGES.slice(0, 7);
              return;
            }
            vm.filteredNav = ADMIN_PAGES.filter(function (item) {
              return item.label.toLowerCase().indexOf(q) !== -1 ||
                     item.section.toLowerCase().indexOf(q) !== -1 ||
                     item.path.toLowerCase().indexOf(q) !== -1;
            });
          };

          vm.navigateTo = function (path) {
            vm.searchActive = false;
            vm.searchQuery = '';
            $location.path(path);
          };

          vm.onSearchBlur = function () {
            $timeout(function () {
              vm.searchActive = false;
            }, 250);
          };

          vm.onSearchKey = function (e) {
            if (e.keyCode === 13) { // Enter
              if (vm.filteredNav && vm.filteredNav.length > 0) {
                vm.navigateTo(vm.filteredNav[0].path);
              }
            } else if (e.keyCode === 27) { // Escape
              vm.searchActive = false;
            }
          };

          vm.toggleSidebarDrawer = function () {
            $rootScope.$broadcast('toggleAdminDrawer');
          };

          vm.primaryRole = function () {
            var u = vm.auth.state && vm.auth.state.user;
            if (!u || !u.roles || !u.roles.length) return 'ADMIN';
            var names = {
              'SUPER_ADMIN': 'Super Admin',
              'COMPETITION_MANAGER': 'Manager',
              'REVIEWER': 'Judge',
              'FINANCE_OFFICER': 'Finance',
              'MODERATOR': 'Moderator'
            };
            return names[u.roles[0]] || u.roles[0];
          };

          function onGlobalKeyDown(e) {
            if (e.key === '/' && vm.isAdmin && document.activeElement && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
              e.preventDefault();
              var input = document.getElementById('adminGlobalSearchInput');
              if (input) {
                input.focus();
                input.select();
              }
            }
          }

          vm.$onInit = function () {
            updateAdminState();
            syncNavbarHeight();
            fetchIncident();
            angular.element($window).on('resize', syncNavbarHeight);
            angular.element($window).on('keydown', onGlobalKeyDown);
          };

          vm.$onDestroy = function () {
            angular.element($window).off('resize', syncNavbarHeight);
            angular.element($window).off('keydown', onGlobalKeyDown);
          };

          $scope.$on('incidentBannerChanged', function () {
            fetchIncident();
          });

          $scope.$on('$routeChangeSuccess', function () {
            vm.menuOpen = false;
            vm.searchActive = false;
            vm.searchQuery = '';
            updateAdminState();
            syncNavbarHeight();
          });

          vm.isActive = function (p) { return $location.path() === p; };
          vm.startsWith = function (prefix) { return $location.path().indexOf(prefix) === 0; };

          vm.logout = function () {
            vm.menuOpen = false;
            AuthService.logout().then(function () {
              ToastService.info('You have been signed out.');
              $location.path('/');
            });
          };
        }
      ]
    });
})();
