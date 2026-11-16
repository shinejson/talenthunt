(function () {
  'use strict';

  angular.module('talentHuntApp')
    .component('thNavbar', {
      template: [
        '<header class="site-navbar" role="banner">',
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
        '        <a href="/how-it-works" ng-class="{active: $ctrl.isActive(\'/how-it-works\')}"><th-icon name="compass" size="16"></th-icon><span>How It Works</span></a>',
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
      controller: ['$location', '$element', '$timeout', '$window', '$scope', 'AuthService', 'PermissionsService', 'ApiService', 'ToastService',
        function ($location, $element, $timeout, $window, $scope, AuthService, PermissionsService, ApiService, ToastService) {
          var vm = this;
          vm.auth = AuthService;
          vm.perms = PermissionsService;
          vm.menuOpen = false;
          vm.incident = null;

          function syncNavbarHeight() {
            $timeout(function () {
              var bar = $element[0] && $element[0].querySelector('.navbar-fixed-bar');
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

          vm.$onInit = function () {
            syncNavbarHeight();
            fetchIncident();
            angular.element($window).on('resize', syncNavbarHeight);
          };

          vm.$onDestroy = function () {
            angular.element($window).off('resize', syncNavbarHeight);
          };

          $scope.$on('incidentBannerChanged', function () {
            fetchIncident();
          });

          $scope.$on('$routeChangeSuccess', function () {
            vm.menuOpen = false;
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
