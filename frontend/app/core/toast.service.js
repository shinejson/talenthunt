(function () {
  'use strict';

  angular.module('talentHuntApp')
    .factory('ToastService', ['$timeout', function ($timeout) {
      var list = [];
      var seq = 1;

      function push(message, kind, ttlMs) {
        var item = { id: seq++, message: message, kind: kind || 'info' };
        list.push(item);
        $timeout(function () {
          dismiss(item.id);
        }, ttlMs || 4500);
      }

      function dismiss(id) {
        for (var i = 0; i < list.length; i++) {
          if (list[i].id === id) {
            list.splice(i, 1);
            break;
          }
        }
      }

      return {
        list: list,
        dismiss: dismiss,
        info: function (msg) { push(msg, 'info'); },
        success: function (msg) { push(msg, 'success'); },
        error: function (msg) { push(msg, 'error', 6000); }
      };
    }]);
})();
