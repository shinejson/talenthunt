(function () {
  'use strict';

  angular.module('talentHuntApp')
    .controller('AdminCompetitionsController', ['ApiService', 'ToastService', function (ApiService, ToastService) {
      var vm = this;
      vm.competitions = [];
      vm.showCreate = false;
      vm.newComp = {
        title: '', tagline: '', description: '', status: 'APPLICATIONS_OPEN',
        currency: 'GHS', timezone: 'Africa/Accra', unit_vote_price_minor: 100,
        public_leaderboard: true, nominee_see_rank: true, prize_summary: '', rules: ''
      };

      vm.load = function () {
        ApiService.get('/admin/competitions').then(function (res) { vm.competitions = res.data || []; });
      };

      vm.create = function () {
        ApiService.post('/admin/competitions', vm.newComp).then(function () {
          ToastService.success('Competition created.');
          vm.showCreate = false;
          vm.load();
        }, function (err) { ToastService.error(err.message); });
      };

      vm.saveComp = function (c) {
        ApiService.patch('/admin/competitions/' + c.id, {
          title: c.title,
          tagline: c.tagline,
          status: c.status,
          public_leaderboard: c.public_leaderboard,
          nominee_see_rank: c.nominee_see_rank,
          voting_paused: c.voting_paused,
          unit_vote_price_minor: c.unit_vote_price_minor,
          max_vote_quantity_per_order: c.max_vote_quantity_per_order,
          rules: c.rules
        }).then(function () {
          ToastService.success('Competition updated.');
          vm.load();
        }, function (err) { ToastService.error(err.message); });
      };

      vm.load();
    }])
    .controller('AdminCategoriesController', ['ApiService', 'ToastService', function (ApiService, ToastService) {
      var vm = this;
      vm.competitions = [];
      vm.categories = [];
      vm.selectedCompId = '';
      vm.newCat = { name: '', description: '' };

      ApiService.get('/admin/competitions').then(function (res) {
        vm.competitions = res.data || [];
        if (vm.competitions.length) {
          vm.selectedCompId = vm.competitions[0].id;
          vm.loadCategories();
        }
      });

      vm.loadCategories = function () {
        ApiService.get('/admin/categories', { competition_id: vm.selectedCompId }).then(function (res) {
          vm.categories = res.data || [];
        });
      };

      vm.createCategory = function () {
        ApiService.post('/admin/categories', {
          competition_id: vm.selectedCompId,
          name: vm.newCat.name,
          description: vm.newCat.description
        }).then(function () {
          vm.newCat = { name: '', description: '' };
          ToastService.success('Category added.');
          vm.loadCategories();
        }, function (err) { ToastService.error(err.message); });
      };

      vm.toggleStatus = function (cat) {
        var next = cat.status === 'ACTIVE' ? 'ARCHIVED' : 'ACTIVE';
        ApiService.patch('/admin/categories/' + cat.id, { status: next }).then(function () {
          vm.loadCategories();
        });
      };
    }])
    .run(['$templateCache', function ($templateCache) {
      $templateCache.put('admin/competitions.html', [
        '<div class="container portal-layout">',
        '  <th-admin-nav></th-admin-nav>',
        '  <div>',
        '    <div class="flex-between mb-2"><h1 style="margin:0;font-size:1.5rem;">Competition Management</h1><button type="button" class="btn btn-primary" ng-click="vm.showCreate = !vm.showCreate">{{ vm.showCreate ? "Cancel" : "+ New Competition" }}</button></div>',
        '    <form class="card mb-3" ng-if="vm.showCreate" ng-submit="vm.create()">',
        '      <h3>Create Competition</h3>',
        '      <div class="grid-2">',
        '        <div class="form-group"><label class="form-label">Title *</label><input type="text" class="form-control" ng-model="vm.newComp.title" required /></div>',
        '        <div class="form-group"><label class="form-label">Status</label><select class="form-control" ng-model="vm.newComp.status"><option value="DRAFT">DRAFT</option><option value="PUBLISHED">PUBLISHED</option><option value="APPLICATIONS_OPEN">APPLICATIONS_OPEN</option><option value="VOTING">VOTING</option></select></div>',
        '      </div>',
        '      <div class="form-group"><label class="form-label">Tagline</label><input type="text" class="form-control" ng-model="vm.newComp.tagline" /></div>',
        '      <div class="grid-2">',
        '        <div class="form-group"><label class="form-label">Unit Vote Price (Pesewas, 100 = GHS 1.00)</label><input type="number" class="form-control" ng-model="vm.newComp.unit_vote_price_minor" /></div>',
        '        <div class="form-group"><label class="form-label">Prize Summary</label><input type="text" class="form-control" ng-model="vm.newComp.prize_summary" /></div>',
        '      </div>',
        '      <div class="form-group"><label class="form-label">Official Rules</label><textarea class="form-control" ng-model="vm.newComp.rules"></textarea></div>',
        '      <button type="submit" class="btn btn-primary">Create Competition</button>',
        '    </form>',

        '    <div class="card mb-2" ng-repeat="c in vm.competitions">',
        '      <div class="flex-between mb-2"><strong>{{ c.title }} (<code>{{ c.slug }}</code>)</strong><th-status-badge status="c.status"></th-status-badge></div>',
        '      <div class="grid-3">',
        '        <div class="form-group"><label class="form-label">Status</label><select class="form-control" ng-model="c.status"><option value="DRAFT">DRAFT</option><option value="PUBLISHED">PUBLISHED</option><option value="APPLICATIONS_OPEN">APPLICATIONS_OPEN</option><option value="REVIEW">REVIEW</option><option value="VOTING">VOTING</option><option value="RESULTS_PENDING">RESULTS_PENDING</option><option value="COMPLETED">COMPLETED</option></select></div>',
        '        <div class="form-group"><label class="form-label">Vote Price (Minor / Pesewas)</label><input type="number" class="form-control" ng-model="c.unit_vote_price_minor" /></div>',
        '        <div class="form-group"><label class="form-label">Max Votes / Order</label><input type="number" class="form-control" ng-model="c.max_vote_quantity_per_order" /></div>',
        '      </div>',
        '      <div class="inline-actions mb-2">',
        '        <label><input type="checkbox" ng-model="c.public_leaderboard" /> Public Leaderboard</label>',
        '        <label><input type="checkbox" ng-model="c.nominee_see_rank" /> Nominee Sees Rank</label>',
        '        <label><input type="checkbox" ng-model="c.voting_paused" /> Pause Competition Voting</label>',
        '      </div>',
        '      <button type="button" class="btn btn-sm btn-primary" ng-click="vm.saveComp(c)">Save Changes</button>',
        '    </div>',
        '  </div>',
        '</div>'
      ].join(''));

      $templateCache.put('admin/categories.html', [
        '<div class="container portal-layout">',
        '  <th-admin-nav></th-admin-nav>',
        '  <div class="card">',
        '    <h1 style="margin-top:0;font-size:1.5rem;">Category Management</h1>',
        '    <div class="form-group"><label class="form-label">Select Competition</label><select class="form-control" ng-model="vm.selectedCompId" ng-change="vm.loadCategories()"><option ng-repeat="c in vm.competitions" value="{{ c.id }}">{{ c.title }}</option></select></div>',
        '    <form class="grid-3 mb-3" ng-submit="vm.createCategory()">',
        '      <input type="text" class="form-control" ng-model="vm.newCat.name" placeholder="Category Name *" required />',
        '      <input type="text" class="form-control" ng-model="vm.newCat.description" placeholder="Short description" />',
        '      <button type="submit" class="btn btn-primary">+ Add Category</button>',
        '    </form>',
        '    <table class="data-table">',
        '      <thead><tr><th>Name</th><th>Slug</th><th>Description</th><th>Status</th><th></th></tr></thead>',
        '      <tbody>',
        '        <tr ng-repeat="cat in vm.categories">',
        '          <td><strong>{{ cat.name }}</strong></td><td><code>{{ cat.slug }}</code></td><td>{{ cat.description }}</td>',
        '          <td><th-status-badge status="cat.status"></th-status-badge></td>',
        '          <td><button type="button" class="btn btn-sm btn-secondary" ng-click="vm.toggleStatus(cat)">{{ cat.status === "ACTIVE" ? "Archive" : "Activate" }}</button></td>',
        '        </tr>',
        '      </tbody>',
        '    </table>',
        '  </div>',
        '</div>'
      ].join(''));
    }]);
})();
