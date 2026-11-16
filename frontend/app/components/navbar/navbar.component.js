(function () {
  'use strict';

  angular.module('talentHuntApp')
    .component('thNavbar', {
      template: [
        '<header class="site-navbar" role="banner">',
        '  <div class="incident-banner" ng-if="$ctrl.incident && $ctrl.incident.message">',
        '    &#9888; {{ $ctrl.incident.message }}',
        '  </div>',
        '  <div class="container navbar-inner">',
        '    <a href="/" class="brand-logo" ng-click="$ctrl.menuOpen = false">',
        '      <span class="brand-mark">SL</span>',
        '      <span>StageLight</span>',
        '      <span class="ghana-stripe" title="Ghana"><span class="gh-r"></span><span class="gh-y"></span><span class="gh-g"></span></span>',
        '    </a>',
        '    <nav class="nav-links" aria-label="Primary Navigation">',
        '      <a href="/" ng-class="{active: $ctrl.isActive(\'/\')}">Home</a>',
        '      <a href="/competitions" ng-class="{active: $ctrl.startsWith(\'/competitions\')}">Competitions</a>',
        '      <a href="/nominees" ng-class="{active: $ctrl.startsWith(\'/nominee\')}">Nominees</a>',
        '      <a href="/results" ng-class="{active: $ctrl.startsWith(\'/results\')}">Results</a>',
        '      <a href="/how-it-works" ng-class="{active: $ctrl.isActive(\'/how-it-works\')}">How It Works</a>',
        '    </nav>',
        '    <div class="nav-actions">',
        '      <a ng-if="!$ctrl.auth.isAuthenticated()" href="/portal/login" class="btn btn-sm btn-outline-light">Sign In</a>',
        '      <a ng-if="!$ctrl.auth.isAuthenticated()" href="/portal/register" class="btn btn-sm btn-gold">Submit Talent</a>',
        '      <a ng-if="$ctrl.auth.isAuthenticated() && $ctrl.perms.isNominee()" href="/portal/voting" class="btn btn-sm btn-gold">My Votes</a>',
        '      <a ng-if="$ctrl.auth.isAuthenticated()" href="/portal/dashboard" class="btn btn-sm btn-outline-light">Portal ({{ $ctrl.auth.state.user.full_name.split(" ")[0] }})</a>',
        '      <a ng-if="$ctrl.auth.isAuthenticated() && $ctrl.perms.canAccessAdmin()" href="/admin" class="btn btn-sm btn-primary">Admin</a>',
        '      <button ng-if="$ctrl.auth.isAuthenticated()" type="button" class="btn btn-sm btn-outline-light" ng-click="$ctrl.logout()">Sign Out</button>',
        '    </div>',
        '    <button type="button" class="mobile-menu-btn" ng-click="$ctrl.menuOpen = !$ctrl.menuOpen" aria-expanded="{{ $ctrl.menuOpen }}">',
        '      {{ $ctrl.menuOpen ? "Close" : "Menu" }}',
        '    </button>',
        '  </div>',
        '  <div class="mobile-drawer" ng-if="$ctrl.menuOpen">',
        '    <a href="/" ng-click="$ctrl.menuOpen=false">Home</a>',
        '    <a href="/competitions" ng-click="$ctrl.menuOpen=false">Competitions</a>',
        '    <a href="/nominees" ng-click="$ctrl.menuOpen=false">Nominees &amp; Vote</a>',
        '    <a href="/results" ng-click="$ctrl.menuOpen=false">Published Results</a>',
        '    <a href="/how-it-works" ng-click="$ctrl.menuOpen=false">How It Works</a>',
        '    <a ng-if="!$ctrl.auth.isAuthenticated()" href="/portal/login" ng-click="$ctrl.menuOpen=false">Sign In</a>',
        '    <a ng-if="!$ctrl.auth.isAuthenticated()" href="/portal/register" ng-click="$ctrl.menuOpen=false">Register / Submit Talent</a>',
        '    <a ng-if="$ctrl.auth.isAuthenticated()" href="/portal/dashboard" ng-click="$ctrl.menuOpen=false">My Portal Dashboard</a>',
        '    <a ng-if="$ctrl.auth.isAuthenticated() && $ctrl.perms.isNominee()" href="/portal/voting" ng-click="$ctrl.menuOpen=false">Nominee Voting Dashboard</a>',
        '    <a ng-if="$ctrl.auth.isAuthenticated() && $ctrl.perms.canAccessAdmin()" href="/admin" ng-click="$ctrl.menuOpen=false">Admin Console</a>',
        '    <button ng-if="$ctrl.auth.isAuthenticated()" type="button" class="btn btn-sm btn-outline-light mt-1" ng-click="$ctrl.logout()">Sign Out</button>',
        '  </div>',
        '</header>'
      ].join(''),
      controller: ['$location', 'AuthService', 'PermissionsService', 'ApiService', 'ToastService',
        function ($location, AuthService, PermissionsService, ApiService, ToastService) {
          var vm = this;
          vm.auth = AuthService;
          vm.perms = PermissionsService;
          vm.menuOpen = false;
          vm.incident = null;

          vm.$onInit = function () {
            ApiService.get('/public/info').then(function (res) {
              vm.incident = res.data.incident_banner;
            });
          };

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
