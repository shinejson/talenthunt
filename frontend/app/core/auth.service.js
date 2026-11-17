(function () {
  'use strict';

  angular.module('talentHuntApp')
    .factory('AuthService', ['$window', '$document', '$interval', '$location', 'ApiService',
      function ($window, $document, $interval, $location, ApiService) {
        var TOKEN_KEY = 'stagelight_auth_token';
        var USER_KEY = 'stagelight_auth_user';
        var PERM_KEY = 'stagelight_auth_perms';

        var state = {
          user: null,
          permissions: {},
          ready: false,
          inactivityWarning: false,
          inactivitySecondsLeft: 0
        };

        var lastActivityTime = Date.now();
        var lastHeartbeatTime = Date.now();
        var monitorPromise = null;

        function recordActivity() {
          lastActivityTime = Date.now();
          if (state.inactivityWarning) {
            state.inactivityWarning = false;
          }
        }

        // Global DOM interaction listener
        ['mousemove', 'keydown', 'touchstart', 'scroll', 'click'].forEach(function (evt) {
          $document.on(evt, recordActivity);
        });

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
          recordActivity();
          startInactivityMonitor();
        }

        function clearLocalState() {
          state.user = null;
          state.permissions = {};
          state.inactivityWarning = false;
          state.inactivitySecondsLeft = 0;
          $window.localStorage.removeItem(TOKEN_KEY);
          $window.localStorage.removeItem(USER_KEY);
          $window.localStorage.removeItem(PERM_KEY);
          stopInactivityMonitor();
        }

        function startInactivityMonitor() {
          if (monitorPromise) return;
          lastActivityTime = Date.now();
          lastHeartbeatTime = Date.now();

          monitorPromise = $interval(function () {
            if (!isAuthenticated()) {
              stopInactivityMonitor();
              return;
            }

            var timeoutMins = (state.user && state.user.session_timeout_minutes) ? Number(state.user.session_timeout_minutes) : 30;
            var timeoutMs = timeoutMins * 60 * 1000;
            var now = Date.now();
            var idleMs = now - lastActivityTime;

            if (idleMs >= timeoutMs) {
              clearLocalState();
              $location.path('/portal/login').search({ reason: 'inactivity' });
              return;
            }

            var warningThresholdMs = 60 * 1000;
            if (timeoutMs - idleMs <= warningThresholdMs) {
              state.inactivityWarning = true;
              state.inactivitySecondsLeft = Math.max(0, Math.floor((timeoutMs - idleMs) / 1000));
            } else {
              state.inactivityWarning = false;
            }

            // Periodic heartbeat every 4 minutes if active
            if (now - lastHeartbeatTime >= 4 * 60 * 1000) {
              if (idleMs < 4 * 60 * 1000) {
                lastHeartbeatTime = now;
                ApiService.post('/auth/session/ping', {}).catch(function () {});
              }
            }
          }, 3000);
        }

        function stopInactivityMonitor() {
          if (monitorPromise) {
            $interval.cancel(monitorPromise);
            monitorPromise = null;
          }
        }

        function isAuthenticated() {
          return !!(state.user && $window.localStorage.getItem(TOKEN_KEY));
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
          isAuthenticated: isAuthenticated,
          getToken: function () {
            return $window.localStorage.getItem(TOKEN_KEY);
          },
          login: function (identifier, password, code) {
            var payload = { identifier: identifier, password: password };
            if (code) payload.code = code;
            return ApiService.post('/auth/login', payload)
              .then(function (res) {
                if (res.data.requires_2fa) {
                  return res.data;
                }
                saveSession(res.data.token, res.data.user, res.data.permissions);
                return res.data;
              });
          },
          verify2fa: function (tempToken, code) {
            return ApiService.post('/auth/2fa/verify', {
              two_factor_temp_token: tempToken,
              code: code
            }).then(function (res) {
              saveSession(res.data.token, res.data.user, res.data.permissions);
              return res.data;
            });
          },
          setup2fa: function () {
            return ApiService.post('/auth/2fa/setup', {});
          },
          confirm2fa: function (code) {
            return ApiService.post('/auth/2fa/confirm', { code: code }).then(function (res) {
              if (state.user) {
                state.user.totp_enabled = true;
                $window.localStorage.setItem(USER_KEY, JSON.stringify(state.user));
              }
              return res;
            });
          },
          disable2fa: function (password, code) {
            return ApiService.post('/auth/2fa/disable', { password: password, code: code }).then(function (res) {
              if (state.user) {
                state.user.totp_enabled = false;
                $window.localStorage.setItem(USER_KEY, JSON.stringify(state.user));
              }
              return res;
            });
          },
          regenerateBackupCodes: function (password, code) {
            return ApiService.post('/auth/2fa/backup-codes', { password: password, code: code });
          },
          getSessions: function () {
            return ApiService.get('/auth/sessions');
          },
          terminateSession: function (sessionId) {
            return ApiService.delete('/auth/sessions/' + sessionId);
          },
          logoutOtherSessions: function () {
            return ApiService.post('/auth/sessions/logout-others', {});
          },
          updateSessionTimeout: function (minutes) {
            return ApiService.post('/auth/session-timeout', { timeout_minutes: minutes }).then(function (res) {
              if (state.user) {
                state.user.session_timeout_minutes = res.data.session_timeout_minutes;
                $window.localStorage.setItem(USER_KEY, JSON.stringify(state.user));
              }
              return res;
            });
          },
          extendSession: function () {
            recordActivity();
            state.inactivityWarning = false;
            return ApiService.post('/auth/session/ping', {});
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
          logout: function (redirectPath) {
            return ApiService.post('/auth/logout', {}).finally(function () {
              clearLocalState();
              var dest = redirectPath || '/portal/login';
              $location.path(dest).search({});
            });
          }
        };
      }]);
})();
