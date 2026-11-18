(function () {
  'use strict';

  var AUTH_ONLY_PORTAL_PATHS = {
    '/portal/login': true,
    '/portal/accept-invitation': true,
    '/portal/forgot-password': true
  };

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
    .factory('AdminFilterUtils', function () {
      function formatDate(d) {
        if (!d) return undefined;
        if (d instanceof Date && !isNaN(d.getTime())) {
          var y = d.getFullYear();
          var m = String(d.getMonth() + 1).padStart(2, '0');
          var day = String(d.getDate()).padStart(2, '0');
          return y + '-' + m + '-' + day;
        }
        if (typeof d === 'string' && d.trim()) {
          return d.trim();
        }
        return undefined;
      }

      function cleanParams(raw) {
        var out = {};
        angular.forEach(raw || {}, function (val, key) {
          if (val === null || val === undefined || val === '') return;
          if (val instanceof Date) {
            var formatted = formatDate(val);
            if (formatted) out[key] = formatted;
            return;
          }
          if (typeof val === 'string') {
            var trimmed = val.trim();
            if (trimmed !== '') out[key] = trimmed;
            return;
          }
          out[key] = val;
        });
        return out;
      }

      function countActive(obj, ignoreKeys) {
        var ignored = {};
        (ignoreKeys || []).forEach(function (k) { ignored[k] = true; });
        var count = 0;
        angular.forEach(obj || {}, function (val, key) {
          if (ignored[key]) return;
          if (val instanceof Date && !isNaN(val.getTime())) {
            count++;
          } else if (typeof val === 'string' && val.trim() !== '') {
            count++;
          } else if (typeof val === 'boolean' && val) {
            count++;
          } else if (typeof val === 'number' && !isNaN(val)) {
            count++;
          }
        });
        return count;
      }

      return {
        formatDate: formatDate,
        cleanParams: cleanParams,
        countActive: countActive
      };
    })
    .run(['$rootScope', '$location', 'AuthService', 'PermissionsService', 'ToastService',
      function ($rootScope, $location, AuthService, PermissionsService, ToastService) {
        $rootScope.auth = AuthService;
        $rootScope.perms = PermissionsService;
        $rootScope.toasts = ToastService.list;
        $rootScope.dismissToast = ToastService.dismiss;

        function syncLayoutFlags() {
          var p = $location.path() || '/';
          var isAdmin = p === '/admin' || p.indexOf('/admin/') === 0;
          var isPortal = (p === '/portal' || p.indexOf('/portal/') === 0) && !AUTH_ONLY_PORTAL_PATHS[p];
          $rootScope.isAdminRoute = isAdmin;
          $rootScope.hasFixedSidebar = isAdmin || isPortal;
        }

        AuthService.bootstrap();
        syncLayoutFlags();

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
          syncLayoutFlags();
          window.scrollTo(0, 0);
        });
      }
    ]);
})();
