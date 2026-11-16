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
              rejection.config.url.indexOf('/api/v1/payments/webhooks') === -1) {
            $window.localStorage.removeItem(TOKEN_KEY);
            var AuthService = $injector.get('AuthService');
            AuthService.clearLocalState();
          }
          return $q.reject(rejection);
        }
      };
    }])
    .config(['$httpProvider', function ($httpProvider) {
      $httpProvider.interceptors.push('AuthHttpInterceptor');
    }]);
})();
