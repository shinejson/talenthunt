(function () {
  'use strict';

  angular.module('talentHuntApp')
    .controller('PortalNotificationsController', ['ApiService', 'ToastService', function (ApiService, ToastService) {
      var vm = this;
      vm.items = [];
      vm.meta = {};

      vm.load = function (page) {
        ApiService.get('/notifications', { page: page || 1 }).then(function (res) {
          vm.items = res.data || [];
          vm.meta = res.meta || {};
        });
      };

      vm.markRead = function (n) {
        ApiService.post('/notifications/' + n.id + '/read', {}).then(function () {
          n.is_read = true;
        });
      };

      vm.markAllRead = function () {
        ApiService.post('/notifications/read-all', {}).then(function () {
          ToastService.success('All notifications marked read.');
          vm.load(1);
        });
      };

      vm.load(1);
    }])
    .run(['$templateCache', function ($templateCache) {
      $templateCache.put('portal/notifications.html', [
        '<div class="container portal-layout">',
        '  <th-portal-nav></th-portal-nav>',
        '  <div class="card">',
        '    <div class="flex-between mb-2"><h1 style="margin:0;font-size:1.45rem;">Notifications</h1><button type="button" class="btn btn-sm btn-secondary" ng-click="vm.markAllRead()">Mark All Read</button></div>',
        '    <div ng-if="!vm.items.length" class="empty-state">No notifications yet.</div>',
        '    <div ng-repeat="n in vm.items" style="padding:14px;border:1px solid var(--border);border-radius:8px;margin-bottom:10px;" ng-style="{\'background\': n.is_read ? \'#fff\' : \'#fffbeb\'}">',
        '      <div class="flex-between"><strong>{{ n.title }}</strong><span class="muted" style="font-size:0.8rem;">{{ n.created_at | date:"medium" }}</span></div>',
        '      <p style="margin:6px 0;color:var(--text-secondary);">{{ n.body }}</p>',
        '      <div class="inline-actions">',
        '        <a ng-if="n.action_url" ng-href="{{ n.action_url }}" class="btn btn-sm btn-primary">Open</a>',
        '        <button ng-if="!n.is_read" type="button" class="btn btn-sm btn-secondary" ng-click="vm.markRead(n)">Mark Read</button>',
        '      </div>',
        '    </div>',
        '    <th-pagination meta="vm.meta" on-page="vm.load(page)"></th-pagination>',
        '  </div>',
        '</div>'
      ].join(''));
    }]);
})();
