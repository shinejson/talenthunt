(function () {
  'use strict';

  angular.module('talentHuntApp')
    .factory('AuthService', ['$window', 'ApiService', function ($window, ApiService) {
      var TOKEN_KEY = 'stagelight_auth_token';
      var USER_KEY = 'stagelight_auth_user';
      var PERM_KEY = 'stagelight_auth_perms';

      var state = {
        user: null,
        permissions: {},
        ready: false
      };

      function saveSession(token, user, permissions) {
        if (token) {
          $window.localStorage.setItem(TOKEN_KEY, token);
        }
        if (user) {
          state.user = user;
          $window.localStorage.setItem(USER_KEY, JSON.stringify(user));
        }
        if (permissions) {
          state.permissions = permissions;
          $window.localStorage.setItem(PERM_KEY, JSON.stringify(permissions));
        }
      }

      function clearLocalState() {
        state.user = null;
        state.permissions = {};
        $window.localStorage.removeItem(TOKEN_KEY);
        $window.localStorage.removeItem(USER_KEY);
        $window.localStorage.removeItem(PERM_KEY);
      }

      function bootstrap() {
        try {
          var rawUser = $window.localStorage.getItem(USER_KEY);
          var rawPerms = $window.localStorage.getItem(PERM_KEY);
          if (rawUser) state.user = JSON.parse(rawUser);
          if (rawPerms) state.permissions = JSON.parse(rawPerms);
        } catch (e) {
          clearLocalState();
        }
        var token = $window.localStorage.getItem(TOKEN_KEY);
        if (token) {
          return ApiService.get('/auth/me').then(function (res) {
            saveSession(null, res.data.user, res.data.permissions);
            state.ready = true;
            return state.user;
          }, function () {
            clearLocalState();
            state.ready = true;
            return null;
          });
        }
        state.ready = true;
        return null;
      }

      return {
        state: state,
        clearLocalState: clearLocalState,
        bootstrap: bootstrap,
        isAuthenticated: function () {
          return !!(state.user && $window.localStorage.getItem(TOKEN_KEY));
        },
        getToken: function () {
          return $window.localStorage.getItem(TOKEN_KEY);
        },
        login: function (identifier, password) {
          return ApiService.post('/auth/login', { identifier: identifier, password: password })
            .then(function (res) {
              saveSession(res.data.token, res.data.user, res.data.permissions);
              return res.data;
            });
        },
        register: function (payload) {
          return ApiService.post('/auth/register', payload).then(function (res) {
            saveSession(res.data.token, res.data.user, res.data.permissions);
            return res.data;
          });
        },
        refreshMe: function () {
          return ApiService.get('/auth/me').then(function (res) {
            saveSession(null, res.data.user, res.data.permissions);
            return res.data;
          });
        },
        updateToken: function (newToken) {
          if (newToken) $window.localStorage.setItem(TOKEN_KEY, newToken);
        },
        logout: function () {
          return ApiService.post('/auth/logout', {}).finally(function () {
            clearLocalState();
          });
        }
      };
    }]);
})();
