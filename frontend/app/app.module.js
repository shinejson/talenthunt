(function () {
  'use strict';

  angular.module('talentHuntApp', ['ngRoute', 'ngSanitize'])
    .filter('ghsCurrency', function () {
      return function (amountMajor, currencyCode) {
        var cur = currencyCode || 'GHS';
        var num = Number(amountMajor || 0);
        return cur + ' ' + num.toFixed(2);
      };
    })
    .filter('initials', function () {
      return function (name) {
        if (!name) return 'TH';
        var parts = String(name).trim().split(/\s+/);
        if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
      };
    })
    .run(['$rootScope', '$location', 'AuthService', 'PermissionsService', 'ToastService',
      function ($rootScope, $location, AuthService, PermissionsService, ToastService) {
        $rootScope.toasts = ToastService.list;
        $rootScope.dismissToast = ToastService.dismiss;

        AuthService.bootstrap();

        $rootScope.$on('$routeChangeStart', function (event, next) {
          if (!next || !next.$$route) return;
          var routeData = next.$$route;
          if (routeData.requireAuth && !AuthService.isAuthenticated()) {
            event.preventDefault();
            $location.path('/portal/login').search({ next: $location.path() });
            return;
          }
          if (routeData.requireRoles && routeData.requireRoles.length) {
            if (!AuthService.isAuthenticated()) {
              event.preventDefault();
              $location.path('/portal/login');
              return;
            }
            if (!PermissionsService.hasAnyRole(routeData.requireRoles)) {
              event.preventDefault();
              ToastService.error('You do not have permission to view that section.');
              $location.path('/portal/dashboard');
            }
          }
        });

        $rootScope.$on('$routeChangeSuccess', function () {
          window.scrollTo(0, 0);
        });
      }
    ]);
})();
