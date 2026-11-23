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
    { path: '/admin/sponsors-partners', label: 'Sponsors, Partners & Supporters', icon: 'handshake', section: 'Talent & Trust', keywords: 'sponsors partners supporters supporting brands inquiries' },
    { path: '/admin/moderation', label: 'Moderation & Support', icon: 'shield-alert', section: 'Talent & Trust' },
    { path: '/admin/accounting', label: 'Financial Hub', icon: 'credit-card', section: 'Accounting & Finance', keywords: 'accounting finance overview money revenue collections payouts escrow' },
    { path: '/admin/accounting/transactions', label: 'Financial Records', icon: 'receipt', section: 'Accounting & Finance', keywords: 'transactions ledger records payments refunds fees charges revenue' },
    { path: '/admin/accounting/payouts', label: 'Prize Disbursements & Grants', icon: 'trophy', section: 'Accounting & Finance', keywords: 'payouts disbursements prizes prize pool grants cash bursaries stipends' },
    { path: '/admin/reconciliation', label: 'Payments & Reconcile', icon: 'credit-card', section: 'Accounting & Finance', keywords: 'payments reconcile webhooks gateways' },
    { path: '/admin/orders', label: 'Orders', icon: 'receipt', section: 'Accounting & Finance', keywords: 'orders receipts voters' },
    { path: '/admin/votes', label: 'Vote Ledger', icon: 'book-ledger', section: 'Accounting & Finance', keywords: 'votes vote ledger adjustments' },
    { path: '/admin/reports', label: 'Reports & CSV', icon: 'pie-chart', section: 'Accounting & Finance', keywords: 'reports csv export financial statements' },
    { path: '/admin/audit-logs', label: 'Audit Logs', icon: 'history', section: 'Accounting & Finance', keywords: 'audit logs trail history' },
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
        '        <a href="/admin" class="admin-brand-pill" title="{{ $ctrl.platformName }} Admin Console">',
        '          <img ng-if="$ctrl.logoUrl" ng-src="{{ $ctrl.logoUrl }}" alt="{{ $ctrl.platformName }}" class="admin-brand-logo-img" />',
        '          <span ng-if="!$ctrl.logoUrl" class="admin-brand-icon"><th-icon name="shield" size="14"></th-icon></span>',
        '          <span ng-if="!$ctrl.logoUrl" class="admin-brand-text">{{ $ctrl.platformName }}</span>',
        '          <span class="admin-brand-badge">Admin</span>',
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
        '          <button type="button" class="admin-logout-btn" ng-click="$ctrl.promptLogout()" title="Sign Out">',
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
        '        <img ng-if="$ctrl.logoUrl" ng-src="{{ $ctrl.logoUrl }}" alt="{{ $ctrl.platformName }}" class="brand-logo-img" />',
        '        <span ng-if="!$ctrl.logoUrl" class="brand-mark">SL</span>',
        '        <span ng-if="!$ctrl.logoUrl">{{ $ctrl.platformName || "StageLight" }}</span>',
        '        <span ng-if="!$ctrl.logoUrl" class="ghana-stripe" title="Ghana"><span class="gh-r"></span><span class="gh-y"></span><span class="gh-g"></span></span>',
        '      </a>',
        '      <nav class="nav-links" aria-label="Primary Navigation">',
        '        <a href="/" ng-class="{active: $ctrl.isActive(\'/\')}"><th-icon name="home" size="16"></th-icon><span>Home</span></a>',
        '        <a href="/competitions" ng-class="{active: $ctrl.startsWith(\'/competitions\')}"><th-icon name="trophy" size="16"></th-icon><span>Competitions</span></a>',
        '        <a href="/nominees" ng-class="{active: $ctrl.startsWith(\'/nominee\')}"><th-icon name="star" size="16"></th-icon><span>Nominees</span></a>',
        '        <a href="/results" ng-class="{active: $ctrl.startsWith(\'/results\')}"><th-icon name="bar-chart" size="16"></th-icon><span>Results</span></a>',
        '        <a href="/track-application" ng-class="{active: $ctrl.isActive(\'/track-application\')}"><th-icon name="search" size="16"></th-icon><span>Track</span></a>',
        '        <div class="nav-dropdown" ng-class="{\'is-open\': $ctrl.dropdownOpen}">',
        '          <button type="button" class="nav-dropdown-trigger" ng-class="{active: $ctrl.isDropdownActive()}" ng-click="$ctrl.toggleDropdown($event)" aria-haspopup="true" aria-expanded="{{ $ctrl.dropdownOpen }}" title="Rules, Sponsors &amp; Strategic Partners">',
        '            <th-icon name="layers" size="16"></th-icon>',
        '            <span>More</span>',
        '            <th-icon name="chevron-down" size="13" class="nav-chevron"></th-icon>',
        '          </button>',
        '          <div class="nav-dropdown-menu" role="menu" ng-click="$event.stopPropagation()">',
        '            <a href="/rules" class="nav-dropdown-item" ng-class="{active: $ctrl.isActive(\'/rules\')}" ng-click="$ctrl.dropdownOpen = false" role="menuitem">',
        '              <div class="nav-dd-icon"><th-icon name="shield" size="16"></th-icon></div>',
        '              <div class="nav-dd-text">',
        '                <span class="nav-dd-title">Rules &amp; Prizes</span>',
        '                <span class="nav-dd-desc">Official guidelines, 1st/2nd/3rd &amp; round prizes</span>',
        '              </div>',
        '            </a>',
        '            <a href="/sponsors" class="nav-dropdown-item" ng-class="{active: $ctrl.startsWith(\'/sponsors\')}" ng-click="$ctrl.dropdownOpen = false" role="menuitem">',
        '              <div class="nav-dd-icon"><th-icon name="gem" size="16"></th-icon></div>',
        '              <div class="nav-dd-text">',
        '                <span class="nav-dd-title">Official Sponsors</span>',
        '                <span class="nav-dd-desc">Title sponsors, brand tiers &amp; packages</span>',
        '              </div>',
        '            </a>',
        '            <a href="/partners" class="nav-dropdown-item" ng-class="{active: $ctrl.startsWith(\'/partners\')}" ng-click="$ctrl.dropdownOpen = false" role="menuitem">',
        '              <div class="nav-dd-icon"><th-icon name="handshake" size="16"></th-icon></div>',
        '              <div class="nav-dd-text">',
        '                <span class="nav-dd-title">Strategic Partners</span>',
        '                <span class="nav-dd-desc">Ecosystem, media &amp; venue partners</span>',
        '              </div>',
        '            </a>',
        '            <div class="nav-dropdown-divider"></div>',
        '            <a href="/how-it-works" class="nav-dropdown-item" ng-class="{active: $ctrl.isActive(\'/how-it-works\')}" ng-click="$ctrl.dropdownOpen = false" role="menuitem">',
        '              <div class="nav-dd-icon"><th-icon name="compass" size="16"></th-icon></div>',
        '              <div class="nav-dd-text">',
        '                <span class="nav-dd-title">How It Works</span>',
        '                <span class="nav-dd-desc">Contestant entry &amp; verified voting guide</span>',
        '              </div>',
        '            </a>',
        '          </div>',
        '        </div>',
        '      </nav>',
        '      <div class="nav-actions">',
        '        <a ng-if="!$ctrl.auth.isAuthenticated()" href="/portal/login" class="btn btn-sm btn-outline-light"><th-icon name="log-in" size="15"></th-icon><span>Sign In</span></a>',
        '        <a ng-if="!$ctrl.auth.isAuthenticated()" href="/apply" class="btn btn-sm btn-gold"><th-icon name="mic" size="15"></th-icon><span>Submit Talent</span></a>',
        '        <div class="nav-profile-dropdown" ng-if="$ctrl.auth.isAuthenticated()" ng-class="{\'is-open\': $ctrl.profileDropdownOpen}">',
        '          <button type="button" class="nav-profile-trigger" ng-click="$ctrl.toggleProfileDropdown($event)" aria-haspopup="true" aria-expanded="{{ $ctrl.profileDropdownOpen }}" title="{{ $ctrl.auth.state.user.full_name }} ({{ $ctrl.primaryRole() }})">',
        '            <div class="nav-profile-avatar">{{ $ctrl.auth.state.user.full_name | initials }}</div>',
        '            <div class="nav-profile-info">',
        '              <span class="nav-profile-name">{{ $ctrl.auth.state.user.full_name.split(" ")[0] }}</span>',
        '              <span class="nav-profile-badge" ng-if="$ctrl.perms.isNominee()">Nominee</span>',
        '              <span class="nav-profile-badge badge-admin" ng-if="!$ctrl.perms.isNominee() && $ctrl.perms.canAccessAdmin()">Admin</span>',
        '            </div>',
        '            <th-icon name="chevron-down" size="13" class="nav-chevron"></th-icon>',
        '          </button>',
        '          <div class="nav-profile-menu" role="menu" ng-click="$event.stopPropagation()">',
        '            <div class="nav-profile-header">',
        '              <div class="nav-profile-header-avatar">{{ $ctrl.auth.state.user.full_name | initials }}</div>',
        '              <div class="nav-profile-header-text">',
        '                <div class="nav-profile-header-name">{{ $ctrl.auth.state.user.full_name }}</div>',
        '                <div class="nav-profile-header-meta">',
        '                  <span class="nav-profile-role-tag">{{ $ctrl.primaryRole() }}</span>',
        '                  <span class="nav-profile-email" title="{{ $ctrl.auth.state.user.email || $ctrl.auth.state.user.phone }}">{{ $ctrl.auth.state.user.email || $ctrl.auth.state.user.phone }}</span>',
        '                </div>',
        '              </div>',
        '            </div>',
        '            <div class="nav-dropdown-divider"></div>',
        '            <a href="/portal/dashboard" class="nav-dropdown-item" ng-class="{active: $ctrl.isActive(\'/portal/dashboard\')}" ng-click="$ctrl.profileDropdownOpen = false" role="menuitem">',
        '              <div class="nav-dd-icon"><th-icon name="dashboard" size="16"></th-icon></div>',
        '              <div class="nav-dd-text">',
        '                <span class="nav-dd-title">Portal Overview</span>',
        '                <span class="nav-dd-desc">Contestant dashboard &amp; overview</span>',
        '              </div>',
        '            </a>',
        '            <a ng-if="$ctrl.perms.isNominee()" href="/portal/voting" class="nav-dropdown-item nav-item-gold" ng-class="{active: $ctrl.isActive(\'/portal/voting\')}" ng-click="$ctrl.profileDropdownOpen = false" role="menuitem">',
        '              <div class="nav-dd-icon icon-gold"><th-icon name="vote" size="16"></th-icon></div>',
        '              <div class="nav-dd-text">',
        '                <span class="nav-dd-title">My Nominee Votes &amp; QR</span>',
        '                <span class="nav-dd-desc">Live votes ledger, packages &amp; QR scan</span>',
        '              </div>',
        '            </a>',
        '            <a href="/portal/submissions" class="nav-dropdown-item" ng-class="{active: $ctrl.isActive(\'/portal/submissions\')}" ng-click="$ctrl.profileDropdownOpen = false" role="menuitem">',
        '              <div class="nav-dd-icon"><th-icon name="folder" size="16"></th-icon></div>',
        '              <div class="nav-dd-text">',
        '                <span class="nav-dd-title">My Applications</span>',
        '                <span class="nav-dd-desc">Talent demo submissions &amp; feedback</span>',
        '              </div>',
        '            </a>',
        '            <a href="/portal/profile" class="nav-dropdown-item" ng-class="{active: $ctrl.isActive(\'/portal/profile\')}" ng-click="$ctrl.profileDropdownOpen = false" role="menuitem">',
        '              <div class="nav-dd-icon"><th-icon name="user" size="16"></th-icon></div>',
        '              <div class="nav-dd-text">',
        '                <span class="nav-dd-title">My Profile</span>',
        '                <span class="nav-dd-desc">Biography, photo &amp; personal details</span>',
        '              </div>',
        '            </a>',
        '            <a href="/portal/security" class="nav-dropdown-item" ng-class="{active: $ctrl.isActive(\'/portal/security\')}" ng-click="$ctrl.profileDropdownOpen = false" role="menuitem">',
        '              <div class="nav-dd-icon"><th-icon name="lock" size="16"></th-icon></div>',
        '              <div class="nav-dd-text">',
        '                <span class="nav-dd-title">Verification &amp; Security</span>',
        '                <span class="nav-dd-desc">Two-factor auth, sessions &amp; devices</span>',
        '              </div>',
        '            </a>',
        '            <a ng-if="$ctrl.perms.canAccessAdmin()" href="/admin" class="nav-dropdown-item nav-item-admin" ng-class="{active: $ctrl.startsWith(\'/admin\')}" ng-click="$ctrl.profileDropdownOpen = false" role="menuitem">',
        '              <div class="nav-dd-icon icon-admin"><th-icon name="shield" size="16"></th-icon></div>',
        '              <div class="nav-dd-text">',
        '                <span class="nav-dd-title">Admin Console</span>',
        '                <span class="nav-dd-desc">Platform operations, audit &amp; settings</span>',
        '              </div>',
        '            </a>',
        '            <div class="nav-dropdown-divider"></div>',
        '            <button type="button" class="nav-dropdown-item nav-item-logout" ng-click="$ctrl.promptLogout()" role="menuitem">',
        '              <div class="nav-dd-icon icon-logout"><th-icon name="log-out" size="16"></th-icon></div>',
        '              <div class="nav-dd-text">',
        '                <span class="nav-dd-title">Sign Out</span>',
        '                <span class="nav-dd-desc">End your active session securely</span>',
        '              </div>',
        '            </button>',
        '          </div>',
        '        </div>',
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
    '    <a href="/rules" ng-click="$ctrl.menuOpen=false" ng-class="{active: $ctrl.isActive(\'/rules\')}"><th-icon name="shield" size="17"></th-icon><span>Official Rules &amp; Prizes</span></a>',
        '    <a href="/sponsors" ng-click="$ctrl.menuOpen=false" ng-class="{active: $ctrl.startsWith(\'/sponsors\')}"><th-icon name="gem" size="17"></th-icon><span>Official Sponsors</span></a>',
        '    <a href="/partners" ng-click="$ctrl.menuOpen=false" ng-class="{active: $ctrl.startsWith(\'/partners\')}"><th-icon name="handshake" size="17"></th-icon><span>Strategic Partners</span></a>',
        '    <a href="/how-it-works" ng-click="$ctrl.menuOpen=false" ng-class="{active: $ctrl.isActive(\'/how-it-works\')}"><th-icon name="compass" size="17"></th-icon><span>How It Works</span></a>',
        '    <a href="/track-application" ng-click="$ctrl.menuOpen=false" ng-class="{active: $ctrl.isActive(\'/track-application\')}"><th-icon name="search" size="17"></th-icon><span>Track Application</span></a>',
        '    <div class="mobile-drawer-divider"></div>',
        '    <a ng-if="!$ctrl.auth.isAuthenticated()" href="/portal/login" ng-click="$ctrl.menuOpen=false"><th-icon name="log-in" size="17"></th-icon><span>Sign In</span></a>',
        '    <a href="/apply" ng-click="$ctrl.menuOpen=false"><th-icon name="mic" size="17"></th-icon><span>Apply to Perform</span></a>',
        '    <a ng-if="$ctrl.auth.isAuthenticated()" href="/portal/dashboard" ng-click="$ctrl.menuOpen=false"><th-icon name="user" size="17"></th-icon><span>My Portal Dashboard</span></a>',
        '    <a ng-if="$ctrl.auth.isAuthenticated() && $ctrl.perms.isNominee()" href="/portal/voting" ng-click="$ctrl.menuOpen=false"><th-icon name="vote" size="17"></th-icon><span>Nominee Voting Dashboard</span></a>',
        '    <a ng-if="$ctrl.auth.isAuthenticated() && $ctrl.perms.canAccessAdmin()" href="/admin" ng-click="$ctrl.menuOpen=false"><th-icon name="shield" size="17"></th-icon><span>Admin Console</span></a>',
        '    <button ng-if="$ctrl.auth.isAuthenticated()" type="button" class="btn btn-sm btn-outline-light mt-1" ng-click="$ctrl.promptLogout()"><th-icon name="log-out" size="15"></th-icon><span>Sign Out</span></button>',
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
        '          Are you sure you want to sign out, <strong>{{ $ctrl.auth.state.user.full_name }}</strong>?',
        '        </p>',
        '        <p class="muted" style="margin:0;font-size:0.85rem;">',
        '          Your current session will be securely ended.',
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
        '</header>'
      ].join(''),
      controller: ['$location', '$element', '$timeout', '$window', '$scope', '$rootScope', 'AuthService', 'PermissionsService', 'ApiService', 'ToastService',
        function ($location, $element, $timeout, $window, $scope, $rootScope, AuthService, PermissionsService, ApiService, ToastService) {
          var vm = this;
          vm.auth = AuthService;
          vm.perms = PermissionsService;
          vm.menuOpen = false;
          vm.dropdownOpen = false;
          vm.profileDropdownOpen = false;

          vm.toggleDropdown = function ($event) {
            if ($event) {
              $event.stopPropagation();
            }
            vm.dropdownOpen = !vm.dropdownOpen;
            if (vm.dropdownOpen) {
              vm.profileDropdownOpen = false;
            }
          };

          vm.toggleProfileDropdown = function ($event) {
            if ($event) {
              $event.stopPropagation();
            }
            vm.profileDropdownOpen = !vm.profileDropdownOpen;
            if (vm.profileDropdownOpen) {
              vm.dropdownOpen = false;
            }
          };

          vm.isDropdownActive = function () {
            return vm.isActive('/rules') ||
                   vm.startsWith('/sponsors') ||
                   vm.startsWith('/partners') ||
                   vm.isActive('/how-it-works');
          };
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

          vm.logoUrl = null;
          vm.faviconUrl = null;
          vm.platformName = 'StageLight';

          function updateFavicon(url) {
            if (!url) return;
            var link = document.getElementById('appFavicon') || document.querySelector("link[rel~='icon']");
            if (!link) {
              link = document.createElement('link');
              link.id = 'appFavicon';
              link.rel = 'icon';
              document.head.appendChild(link);
            }
            link.href = url;
          }

          function fetchPlatformInfo() {
            ApiService.get('/public/info').then(function (res) {
              var data = (res && res.data) || {};
              vm.incident = data.incident_banner;
              vm.logoUrl = data.logo_url || (data.basic_info && data.basic_info.logo_url) || null;
              vm.faviconUrl = data.favicon_url || (data.basic_info && data.basic_info.favicon_url) || null;
              if (data.platform_name) {
                vm.platformName = data.platform_name;
              }
              if (vm.faviconUrl) {
                updateFavicon(vm.faviconUrl);
              }
              syncNavbarHeight();
            }).catch(function () {});
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
                     item.path.toLowerCase().indexOf(q) !== -1 ||
                     (item.keywords && item.keywords.toLowerCase().indexOf(q) !== -1);
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
            if (!u || !u.roles || !u.roles.length) return 'Contestant';
            var names = {
              'SUPER_ADMIN': 'Super Admin',
              'COMPETITION_MANAGER': 'Comp Manager',
              'REVIEWER': 'Reviewer / Judge',
              'FINANCE_OFFICER': 'Finance Officer',
              'MODERATOR': 'Moderator',
              'NOMINEE': 'Nominee Contestant',
              'APPLICANT': 'Applicant'
            };
            if (u.roles.indexOf('SUPER_ADMIN') !== -1) return 'Super Admin';
            if (u.roles.indexOf('NOMINEE') !== -1) return 'Nominee Contestant';
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

          function onGlobalClick(e) {
            if (vm.dropdownOpen || vm.profileDropdownOpen) {
              var ddEl = $element[0] && $element[0].querySelector('.nav-dropdown');
              var profEl = $element[0] && $element[0].querySelector('.nav-profile-dropdown');
              var inDd = ddEl && ddEl.contains(e.target);
              var inProf = profEl && profEl.contains(e.target);
              if (!inDd && !inProf) {
                $scope.$evalAsync(function () {
                  vm.dropdownOpen = false;
                  vm.profileDropdownOpen = false;
                });
              }
            }
          }

          vm.$onInit = function () {
            updateAdminState();
            syncNavbarHeight();
            fetchPlatformInfo();
            angular.element($window).on('resize', syncNavbarHeight);
            angular.element($window).on('keydown', onGlobalKeyDown);
            angular.element($window).on('click', onGlobalClick);
          };

          vm.$onDestroy = function () {
            angular.element($window).off('resize', syncNavbarHeight);
            angular.element($window).off('keydown', onGlobalKeyDown);
            angular.element($window).off('click', onGlobalClick);
          };

          $scope.$on('incidentBannerChanged', function () {
            fetchPlatformInfo();
          });
          $rootScope.$on('platformInfoChanged', function () {
            fetchPlatformInfo();
          });

          $scope.$on('$routeChangeSuccess', function () {
            vm.menuOpen = false;
            vm.dropdownOpen = false;
            vm.profileDropdownOpen = false;
            vm.searchActive = false;
            vm.searchQuery = '';
            updateAdminState();
            syncNavbarHeight();
          });

          vm.isActive = function (p) { return $location.path() === p; };
          vm.startsWith = function (prefix) { return $location.path().indexOf(prefix) === 0; };

          vm.showLogoutModal = false;
          vm.promptLogout = function () {
            vm.profileDropdownOpen = false;
            vm.dropdownOpen = false;
            vm.menuOpen = false;
            vm.showLogoutModal = true;
          };

          vm.confirmLogout = function () {
            vm.showLogoutModal = false;
            AuthService.logout('/portal/login').then(function () {
              ToastService.info('You have been signed out.');
            });
          };

          vm.logout = vm.promptLogout;
        }
      ]
    });
})();
