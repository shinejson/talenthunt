(function () {
  'use strict';

  var NOMINEE_VISUALS = {
    'ama-gold': '/assets/images/talent-ama.jpg',
    'kwesi-motion': '/assets/images/talent-kwesi.jpg',
    'poetess-esi': '/assets/images/talent-esi.jpg',
    'king-zongo-bars': '/assets/images/talent-ibrahim.jpg',
    'kojo-laughs': '/assets/images/talent-kojo.jpg'
  };
  var DEFAULT_IMAGES = [
    '/assets/images/talent-ama.jpg',
    '/assets/images/talent-kwesi.jpg',
    '/assets/images/talent-esi.jpg',
    '/assets/images/talent-ibrahim.jpg',
    '/assets/images/talent-kojo.jpg'
  ];

  function resolveImage(slug, idx) {
    var s = (slug || '').toLowerCase();
    for (var k in NOMINEE_VISUALS) {
      if (s.indexOf(k) !== -1) return NOMINEE_VISUALS[k];
    }
    return DEFAULT_IMAGES[idx % DEFAULT_IMAGES.length];
  }

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
          if (vm.nominees) {
            vm.nominees.forEach(function (n, idx) {
              n.image = resolveImage(n.public_slug, idx);
            });
          }
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
        '      <div class="nominee-card-banner">',
        '        <img ng-src="{{ n.image }}" alt="{{ n.public_name }}" />',
        '        <div class="nominee-card-banner-overlay">',
        '          <div class="nominee-avatar" style="width:40px;height:40px;font-size:0.9rem;border:2px solid #fff;">{{ n.public_name | initials }}</div>',
        '          <span class="category-badge-pill" style="position:static;">{{ n.category_name }}</span>',
        '        </div>',
        '      </div>',
        '      <div class="nominee-card-content">',
        '        <div>',
        '          <h3 style="margin:0;font-size:1.1rem;"><a ng-href="/nominee/{{ n.public_slug }}">{{ n.public_name }}</a></h3>',
        '          <div class="nominee-meta mb-1">{{ n.location || "Ghana" }}</div>',
        '          <p style="font-size:0.88rem;color:var(--text-secondary);margin:0 0 12px;">{{ n.tagline || (n.profile_text | limitTo:100) }}</p>',
        '        </div>',
        '        <div>',
        '          <div class="flex-between mb-2">',
        '            <th-status-badge status="n.status"></th-status-badge>',
        '            <span class="nominee-votes-pill" ng-if="n.public_votes !== undefined && n.public_votes !== null">&#9733; {{ n.public_votes | number }} votes</span>',
        '          </div>',
        '          <div class="inline-actions" style="width:100%;">',
        '            <a ng-href="/nominee/{{ n.public_slug }}" class="btn btn-sm btn-secondary" style="flex:1;">View Demo</a>',
        '            <a ng-if="n.status === \'ACTIVE\' || n.status === \'QUALIFIED\'" ng-href="{{ n.voting_path }}" class="btn btn-sm btn-primary" style="flex:1;">Vote Now</a>',
        '          </div>',
        '        </div>',
        '      </div>',
        '    </div>',
        '  </div>',
        '  <th-pagination ng-if="vm.meta && vm.meta.pages > 1" page="vm.meta.page" pages="vm.meta.pages" on-page="vm.load(page)"></th-pagination>',
        '</div>'
      ].join(''));
    }]);
})();
