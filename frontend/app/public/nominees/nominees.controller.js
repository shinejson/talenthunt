(function () {
  'use strict';

  angular.module('talentHuntApp')
    .controller('NomineesDirectoryController', ['$location', 'ApiService', function ($location, ApiService) {
      var vm = this;
      vm.loading = true;
      vm.nominees = [];
      vm.meta = {};
      vm.categories = [];
      vm.filters = {
        q: $location.search().q || '',
        category: $location.search().category || '',
        status: $location.search().status || '',
        competition: $location.search().competition || '',
        page: 1
      };

      ApiService.get('/public/home').then(function (res) {
        if (res.data.active_competition) {
          vm.categories = res.data.active_competition.categories || [];
        }
      });

      vm.load = function (page) {
        vm.filters.page = page || 1;
        vm.loading = true;
        ApiService.get('/nominees', vm.filters).then(function (res) {
          vm.nominees = res.data;
          vm.meta = res.meta;
          vm.loading = false;
        }, function () { vm.loading = false; });
      };

      vm.reset = function () {
        vm.filters = { q: '', category: '', status: '', competition: '', page: 1 };
        vm.load(1);
      };

      vm.load(1);
    }])
    .run(['$templateCache', function ($templateCache) {
      $templateCache.put('public/nominees.html', [
        '<div class="page-header"><div class="container"><h1>Nominee Directory</h1><p>Search verified contestants, watch their demos, and cast paid votes in active rounds.</p></div></div>',
        '<div class="container mb-3">',
        '  <form class="card mb-3" ng-submit="vm.load(1)">',
        '    <div class="grid-4">',
        '      <div><label class="form-label">Search Name or City</label><input type="text" class="form-control" ng-model="vm.filters.q" placeholder="e.g. Ama Gold, Accra..." /></div>',
        '      <div><label class="form-label">Category</label><select class="form-control" ng-model="vm.filters.category"><option value="">All Categories</option><option ng-repeat="c in vm.categories" value="{{ c.slug }}">{{ c.name }}</option></select></div>',
        '      <div><label class="form-label">Contestant Status</label><select class="form-control" ng-model="vm.filters.status"><option value="">All Public Statuses</option><option value="ACTIVE">Active in Round</option><option value="QUALIFIED">Qualified</option><option value="WINNER">Winner</option><option value="ELIMINATED">Eliminated</option></select></div>',
        '      <div style="display:flex;align-items:flex-end;gap:8px;"><button type="submit" class="btn btn-primary" style="flex:1;">Filter</button><button type="button" class="btn btn-secondary" ng-click="vm.reset()">Reset</button></div>',
        '    </div>',
        '  </form>',

        '  <div ng-if="vm.loading" class="loading-box">Loading nominees...</div>',
        '  <div ng-if="!vm.loading && !vm.nominees.length" class="card empty-state">No nominees matched your search criteria.</div>',
        '  <div class="grid-3" ng-if="!vm.loading && vm.nominees.length">',
        '    <div class="card nominee-card" ng-repeat="n in vm.nominees">',
        '      <div>',
        '        <div class="nominee-card-top">',
        '          <div class="nominee-avatar">{{ n.public_name | initials }}</div>',
        '          <div>',
        '            <h3 style="margin:0;font-size:1.1rem;"><a ng-href="/nominee/{{ n.public_slug }}">{{ n.public_name }}</a></h3>',
        '            <div class="nominee-meta">{{ n.category_name }} &bull; {{ n.location || "Ghana" }}</div>',
        '          </div>',
        '        </div>',
        '        <p style="font-size:0.92rem;color:var(--text-secondary);">{{ n.tagline || (n.profile_text | limitTo:120) }}</p>',
        '      </div>',
        '      <div>',
        '        <div class="flex-between mb-2">',
        '          <th-status-badge status="n.status"></th-status-badge>',
        '          <span class="nominee-votes-pill" ng-if="n.public_votes !== undefined && n.public_votes !== null">&#9733; {{ n.public_votes | number }} votes</span>',
        '        </div>',
        '        <div class="inline-actions" style="width:100%;">',
        '          <a ng-href="/nominee/{{ n.public_slug }}" class="btn btn-sm btn-secondary" style="flex:1;">View Demo</a>',
        '          <a ng-if="n.status === \'ACTIVE\' || n.status === \'QUALIFIED\'" ng-href="{{ n.voting_path }}" class="btn btn-sm btn-primary" style="flex:1;">Vote Now</a>',
        '        </div>',
        '      </div>',
        '    </div>',
        '  </div>',
        '  <th-pagination meta="vm.meta" on-page="vm.load(page)"></th-pagination>',
        '</div>'
      ].join(''));
    }]);
})();
