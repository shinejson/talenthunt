(function () {
  'use strict';

  angular.module('talentHuntApp')
    .controller('AdminNomineesController', ['ApiService', 'PermissionsService', 'ToastService',
      function (ApiService, PermissionsService, ToastService) {
        var vm = this;
        vm.perms = PermissionsService;
        vm.items = [];
        vm.meta = {};

        vm.load = function (page) {
          ApiService.get('/admin/nominees', { page: page || 1 }).then(function (res) {
            vm.items = res.data || [];
            vm.meta = res.meta || {};
          });
        };

        vm.toggleFeatured = function (n) {
          ApiService.patch('/admin/nominees/' + n.id, { is_featured: !n.is_featured }).then(function () {
            vm.load(vm.meta.page);
          });
        };

        vm.togglePause = function (n) {
          ApiService.patch('/admin/nominees/' + n.id, { voting_paused: !n.voting_paused }).then(function () {
            ToastService.info('Nominee voting pause updated.');
            vm.load(vm.meta.page);
          });
        };

        vm.reissueLink = function (n) {
          var reason = window.prompt('Enter audit reason for reissuing voting link:');
          if (!reason) return;
          ApiService.post('/admin/nominees/' + n.id + '/voting-link', { action: 'reissue', reason: reason }).then(function () {
            ToastService.success('New unique voting link issued and audited.');
            vm.load(vm.meta.page);
          }, function (err) { ToastService.error(err.message); });
        };

        vm.disqualify = function (n) {
          var reason = window.prompt('Enter documented reason for disqualifying ' + n.public_name + ':');
          if (!reason) return;
          ApiService.patch('/admin/nominees/' + n.id, { status: 'DISQUALIFIED', reason: reason }).then(function () {
            ToastService.success(n.public_name + ' marked DISQUALIFIED.');
            vm.load(vm.meta.page);
          }, function (err) { ToastService.error(err.message); });
        };

        vm.load(1);
      }
    ])
    .run(['$templateCache', function ($templateCache) {
      $templateCache.put('admin/nominees.html', [
        '<div class="container portal-layout">',
        '  <th-admin-nav></th-admin-nav>',
        '  <div class="card">',
        '    <h1 style="margin-top:0;font-size:1.5rem;">Nominee &amp; Voting Link Management</h1>',
        '    <div class="table-responsive">',
        '      <table class="data-table">',
        '        <thead><tr><th>Nominee</th><th>Category</th><th>Active Voting Slug</th><th>Round Votes</th><th>Status</th><th>Controls</th></tr></thead>',
        '        <tbody>',
        '          <tr ng-repeat="n in vm.items">',
        '            <td><a ng-href="/nominee/{{ n.public_slug }}"><strong>{{ n.public_name }}</strong></a><div class="muted" style="font-size:0.78rem;">Featured: {{ n.is_featured ? "Yes" : "No" }}</div></td>',
        '            <td>{{ n.category_name }}</td>',
        '            <td><code>{{ n.voting_slug }}</code></td>',
        '            <td><strong>{{ n.current_round_votes | number }}</strong> <span class="muted">({{ n.total_votes | number }} total)</span></td>',
        '            <td><th-status-badge status="n.status"></th-status-badge><span ng-if="n.voting_paused" class="status-badge badge-danger" style="margin-left:4px;">PAUSED</span></td>',
        '            <td class="inline-actions" ng-if="vm.perms.canManageCompetition()">',
        '              <button type="button" class="btn btn-sm btn-secondary" ng-click="vm.toggleFeatured(n)">{{ n.is_featured ? "Unfeature" : "Feature" }}</button>',
        '              <button type="button" class="btn btn-sm btn-secondary" ng-click="vm.togglePause(n)">{{ n.voting_paused ? "Resume" : "Pause" }}</button>',
        '              <button type="button" class="btn btn-sm btn-secondary" ng-click="vm.reissueLink(n)">Reissue Link</button>',
        '              <button ng-if="n.status !== \'DISQUALIFIED\'" type="button" class="btn btn-sm btn-danger" ng-click="vm.disqualify(n)">Disqualify</button>',
        '            </td>',
        '          </tr>',
        '        </tbody>',
        '      </table>',
        '    </div>',
        '    <th-pagination meta="vm.meta" on-page="vm.load(page)"></th-pagination>',
        '  </div>',
        '</div>'
      ].join(''));
    }]);
})();
