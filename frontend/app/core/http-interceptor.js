(function () {
  'use strict';

  angular.module('talentHuntApp')
    .factory('AuthHttpInterceptor', ['$q', '$window', '$injector', function ($q, $window, $injector) {
      var TOKEN_KEY = 'stagelight_auth_token';

      return {
        request: function (config) {
          config.headers = config.headers || {};
          if (config.url && config.url.indexOf('/api/') === 0) {
            var token = $window.localStorage.getItem(TOKEN_KEY);
            if (token) {
              config.headers.Authorization = 'Bearer ' + token;
            }
            config.headers['X-Requested-With'] = 'XMLHttpRequest';
          }
          return config;
        },
        responseError: function (rejection) {
          if (rejection.status === 401 && rejection.config && rejection.config.url &&
              rejection.config.url.indexOf('/api/v1/auth/login') === -1 &&
              rejection.config.url.indexOf('/api/v1/auth/2fa/verify') === -1 &&
              rejection.config.url.indexOf('/api/v1/payments/webhooks') === -1) {
            $window.localStorage.removeItem(TOKEN_KEY);
            var AuthService = $injector.get('AuthService');
            AuthService.clearLocalState();
            var $location = $injector.get('$location');
            var errCode = rejection.data && rejection.data.error ? rejection.data.error.code : '';
            var reason = 'unauthorized';
            if (errCode === 'SESSION_EXPIRED') {
              reason = 'inactivity';
            } else if (errCode === 'SESSION_REVOKED') {
              reason = 'revoked';
            }
            $location.path('/portal/login').search({ reason: reason });
          }
          return $q.reject(rejection);
        }
      };
    }])
    .config(['$httpProvider', function ($httpProvider) {
      $httpProvider.interceptors.push('AuthHttpInterceptor');
    }]);
})();
