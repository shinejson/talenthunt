(function () {
  'use strict';

  angular.module('talentHuntApp')
    .factory('ApiService', ['$http', '$q', function ($http, $q) {
      var BASE = '/api/v1';

      function unwrap(promise) {
        return promise.then(function (resp) {
          return resp.data;
        }, function (err) {
          var errObj = (err && err.data && err.data.error) ? err.data.error : {
            code: 'NETWORK_ERROR',
            message: 'Unable to complete request. Please try again.',
            fields: {}
          };
          errObj.status = err ? err.status : 0;
          return $q.reject(errObj);
        });
      }

      return {
        get: function (path, params) {
          return unwrap($http.get(BASE + path, { params: params || {} }));
        },
        post: function (path, data, headers) {
          return unwrap($http.post(BASE + path, data || {}, { headers: headers || {} }));
        },
        patch: function (path, data) {
          return unwrap($http.patch(BASE + path, data || {}));
        },
        delete: function (path) {
          return unwrap($http.delete(BASE + path));
        },
        upload: function (path, fileObj) {
          var fd = new FormData();
          fd.append('file', fileObj);
          return unwrap($http.post(BASE + path, fd, {
            transformRequest: angular.identity,
            headers: { 'Content-Type': undefined }
          }));
        }
      };
    }]);
})();
