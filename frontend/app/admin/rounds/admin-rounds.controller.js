(function () {
  'use strict';

  angular.module('talentHuntApp')
    .controller('AdminRoundsController', ['ApiService', 'ToastService', function (ApiService, ToastService) {
      var vm = this;
      vm.competitions = [];
      vm.selectedCompId = '';
      vm.rounds = [];
      vm.packages = [];
      vm.newRound = { name: '', status: 'SCHEDULED', method: 'top_n', advance_count: 3, is_finale: false };
      vm.newPkg = { name: '', vote_quantity: 25, price_minor: 2500, is_featured: false };

      ApiService.get('/admin/competitions').then(function (res) {
        vm.competitions = res.data || [];
        if (vm.competitions.length) {
          vm.selectedCompId = vm.competitions[0].id;
          vm.loadAll();
        }
      });

      vm.loadAll = function () {
        ApiService.get('/admin/rounds', { competition_id: vm.selectedCompId }).then(function (res) { vm.rounds = res.data || []; });
        ApiService.get('/admin/packages', { competition_id: vm.selectedCompId }).then(function (res) { vm.packages = res.data || []; });
      };

      vm.createRound = function () {
        ApiService.post('/admin/rounds', {
          competition_id: vm.selectedCompId,
          name: vm.newRound.name,
          status: vm.newRound.status,
          is_finale: vm.newRound.is_finale,
          elimination_config: {
            method: vm.newRound.method,
            advance_count: parseInt(vm.newRound.advance_count || 3, 10),
            tie_breakers: ['judge_score_desc', 'earliest_qualifying_vote_timestamp'],
            exclude_disqualified: true,
            pending_payment_grace_minutes: 30
          }
        }).then(function () {
          vm.newRound.name = '';
          ToastService.success('Round created.');
          vm.loadAll();
        }, function (err) { ToastService.error(err.message); });
      };

      vm.updateRoundStatus = function (r, st) {
        ApiService.patch('/admin/rounds/' + r.id, { status: st }).then(function () {
          ToastService.success('Round status updated to ' + st);
          vm.loadAll();
        }, function (err) { ToastService.error(err.message); });
      };

      vm.createPackage = function () {
        ApiService.post('/admin/packages', {
          competition_id: vm.selectedCompId,
          name: vm.newPkg.name,
          vote_quantity: parseInt(vm.newPkg.vote_quantity, 10),
          price_minor: parseInt(vm.newPkg.price_minor, 10),
          is_featured: vm.newPkg.is_featured
        }).then(function () {
          vm.newPkg.name = '';
          ToastService.success('Vote package created.');
          vm.loadAll();
        }, function (err) { ToastService.error(err.message); });
      };
    }])
    .run(['$templateCache', function ($templateCache) {
      $templateCache.put('admin/rounds.html', [
        '<div class="container portal-layout">',
        '  <th-admin-nav></th-admin-nav>',
        '  <div>',
        '    <div class="card mb-3">',
        '      <h1 style="margin-top:0;font-size:1.5rem;">Rounds &amp; Vote Packages</h1>',
        '      <div class="form-group"><label class="form-label">Competition</label><select class="form-control" ng-model="vm.selectedCompId" ng-change="vm.loadAll()"><option ng-repeat="c in vm.competitions" value="{{ c.id }}">{{ c.title }}</option></select></div>',
        '      <h3>Create New Round</h3>',
        '      <form class="grid-4 mb-3" ng-submit="vm.createRound()">',
        '        <input type="text" class="form-control" ng-model="vm.newRound.name" placeholder="Round Name *" required />',
        '        <select class="form-control" ng-model="vm.newRound.method"><option value="top_n">Top N</option><option value="percentage">Percentage</option><option value="threshold">Vote Threshold</option><option value="hybrid">Hybrid (Votes + Judge)</option><option value="manual">Manual Panel</option></select>',
        '        <input type="number" class="form-control" ng-model="vm.newRound.advance_count" placeholder="Advance N" />',
        '        <button type="submit" class="btn btn-primary">+ Create Round</button>',
        '      </form>',
        '      <div class="table-responsive">',
        '        <table class="data-table">',
        '          <thead><tr><th>#</th><th>Round</th><th>Elimination Method</th><th>Status</th><th>Quick State Controls</th></tr></thead>',
        '          <tbody>',
        '            <tr ng-repeat="r in vm.rounds">',
        '              <td>{{ r.sequence_no }}</td>',
        '              <td><strong>{{ r.name }}</strong><span ng-if="r.is_finale" class="status-badge badge-info" style="margin-left:6px;">Finale</span></td>',
        '              <td><code>{{ r.elimination_config.method }}</code> (N={{ r.elimination_config.advance_count || "-" }})</td>',
        '              <td><th-status-badge status="r.status"></th-status-badge></td>',
        '              <td class="inline-actions">',
        '                <button ng-if="r.status !== \'OPEN\' && r.status !== \'FINALIZED\'" type="button" class="btn btn-sm btn-success" ng-click="vm.updateRoundStatus(r, \'OPEN\')">Open Voting</button>',
        '                <button ng-if="r.status === \'OPEN\'" type="button" class="btn btn-sm btn-secondary" ng-click="vm.updateRoundStatus(r, \'CLOSED\')">Freeze / Close</button>',
        '                <a ng-href="/admin/eliminations?round={{ r.id }}" class="btn btn-sm btn-primary">Elimination</a>',
        '              </td>',
        '            </tr>',
        '          </tbody>',
        '        </table>',
        '      </div>',
        '    </div>',

        '    <div class="card">',
        '      <h3 style="margin-top:0;">Vote Packages (Minor Units: 100 pesewas = GHS 1.00)</h3>',
        '      <form class="grid-4 mb-2" ng-submit="vm.createPackage()">',
        '        <input type="text" class="form-control" ng-model="vm.newPkg.name" placeholder="Package Name *" required />',
        '        <input type="number" class="form-control" ng-model="vm.newPkg.vote_quantity" placeholder="Vote Quantity" required />',
        '        <input type="number" class="form-control" ng-model="vm.newPkg.price_minor" placeholder="Price in pesewas" required />',
        '        <button type="submit" class="btn btn-primary">+ Add Package</button>',
        '      </form>',
        '      <table class="data-table">',
        '        <thead><tr><th>Package</th><th>Votes</th><th>Price</th><th>Featured</th></tr></thead>',
        '        <tbody><tr ng-repeat="p in vm.packages"><td><strong>{{ p.name }}</strong></td><td>{{ p.vote_quantity }}</td><td>{{ p.price_major | ghsCurrency:p.currency }}</td><td>{{ p.is_featured ? "Yes" : "No" }}</td></tr></tbody>',
        '      </table>',
        '    </div>',
        '  </div>',
        '</div>'
      ].join(''));
    }]);
})();
