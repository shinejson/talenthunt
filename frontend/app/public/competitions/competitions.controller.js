(function () {
  'use strict';

  angular.module('talentHuntApp')
    .controller('CompetitionsListController', ['ApiService', function (ApiService) {
      var vm = this;
      vm.loading = true;
      vm.competitions = [];

      ApiService.get('/competitions').then(function (res) {
        vm.competitions = res.data;
        vm.loading = false;
      }, function () { vm.loading = false; });
    }])
    .controller('CompetitionDetailController', ['$routeParams', 'ApiService', function ($routeParams, ApiService) {
      var vm = this;
      vm.loading = true;
      vm.comp = null;
      vm.error = null;

      ApiService.get('/competitions/' + $routeParams.slug).then(function (res) {
        vm.comp = res.data;
        vm.loading = false;
      }, function (err) {
        vm.error = err.message;
        vm.loading = false;
      });
    }])
    .run(['$templateCache', function ($templateCache) {
      $templateCache.put('public/competitions.html', [
        '<div class="page-header"><div class="container"><h1>Talent Competitions</h1><p>Explore active and past StageLight competitions, entry dates, and voting windows.</p></div></div>',
        '<div class="container mb-3">',
        '  <div ng-if="vm.loading" class="loading-box">Loading competitions...</div>',
        '  <div class="card" ng-repeat="c in vm.competitions">',
        '    <div class="flex-between">',
        '      <div>',
        '        <th-status-badge status="c.status"></th-status-badge>',
        '        <h2 style="margin:8px 0 6px;"><a ng-href="/competitions/{{ c.slug }}">{{ c.title }}</a></h2>',
        '        <p class="muted" style="margin:0;">{{ c.tagline }}</p>',
        '      </div>',
        '      <div class="inline-actions">',
        '        <a ng-href="/competitions/{{ c.slug }}" class="btn btn-secondary">View Rules &amp; Rounds</a>',
        '        <a href="/nominees?competition={{ c.slug }}" class="btn btn-primary">Meet Nominees</a>',
        '      </div>',
        '    </div>',
        '  </div>',
        '</div>'
      ].join(''));

      $templateCache.put('public/competition-detail.html', [
        '<div class="container mt-3 mb-3">',
        '  <div ng-if="vm.loading" class="loading-box">Loading competition...</div>',
        '  <div ng-if="vm.error" class="alert alert-danger">{{ vm.error }}</div>',
        '  <div ng-if="vm.comp">',
        '    <div class="card">',
        '      <div class="flex-between">',
        '        <th-status-badge status="vm.comp.status"></th-status-badge>',
        '        <span class="muted">Timezone: {{ vm.comp.timezone }} &bull; Currency: {{ vm.comp.currency }}</span>',
        '      </div>',
        '      <h1 style="margin:10px 0 8px;">{{ vm.comp.title }}</h1>',
        '      <p style="font-size:1.05rem;color:var(--text-secondary);">{{ vm.comp.description }}</p>',
        '      <div class="alert alert-warning" ng-if="vm.comp.prize_summary"><strong>Grand Prize:</strong> {{ vm.comp.prize_summary }}</div>',
        '      <div class="inline-actions">',
        '        <a ng-if="vm.comp.accepts_applications &amp;&amp; vm.comp.categories.length" ng-href="/apply?competition={{ vm.comp.slug }}" class="btn btn-primary">Apply to This Competition</a>',
        '        <a href="/rules" class="btn btn-secondary">Official Rules &amp; Prizes</a>',
        '        <a ng-href="/nominees?competition={{ vm.comp.slug }}" class="btn btn-secondary">Browse Nominees</a>',
        '        <a ng-href="/results/{{ vm.comp.slug }}" class="btn btn-secondary">Published Results</a>',
        '      </div>',
        '    </div>',
        '    <div class="grid-2 mt-3">',
        '      <div class="card">',
        '        <h3>Competition Rounds</h3>',
        '        <div ng-repeat="r in vm.comp.rounds" style="padding:10px 0;border-bottom:1px solid var(--border);">',
        '          <div class="flex-between"><strong>{{ r.sequence_no }}. {{ r.name }}</strong><th-status-badge status="r.status"></th-status-badge></div>',
        '          <div class="muted" style="font-size:0.84rem;">Opens: {{ (r.voting_opens_at | date:"medium") || "TBA" }} &bull; Closes: {{ (r.voting_closes_at | date:"medium") || "TBA" }}</div>',
        '          <div class="muted" style="font-size:0.84rem;" ng-if="r.elimination_config.method">Progression rule: <strong>{{ r.elimination_config.method | uppercase }}</strong></div>',
        '        </div>',
        '      </div>',
        '      <div class="card">',
        '        <h3>Categories &amp; Vote Pricing</h3>',
        '        <div class="mb-2"><span class="status-badge badge-neutral" ng-repeat="cat in vm.comp.categories" style="margin:0 6px 6px 0;">{{ cat.name }}</span></div>',
        '        <p class="muted">Base Vote Price: <strong>{{ vm.comp.unit_vote_price_major | ghsCurrency:vm.comp.currency }}</strong> per vote (Min {{ vm.comp.min_vote_quantity }}, Max {{ vm.comp.max_vote_quantity_per_order }} per order).</p>',
        '        <h4>Eligibility</h4><p class="muted">{{ vm.comp.eligibility || "See competition rules below." }}</p>',
        '        <h4>Official Rules</h4><pre style="white-space:pre-wrap;font-family:inherit;font-size:0.9rem;color:var(--text-secondary);margin:0;">{{ vm.comp.rules }}</pre>',
        '      </div>',
        '    </div>',
        '    <div class="card mt-3" ng-if="(vm.comp.sponsors && vm.comp.sponsors.length) || (vm.comp.partners && vm.comp.partners.length)">',
        '      <div class="flex-between mb-2" style="flex-wrap:wrap;gap:10px;">',
        '        <h3 style="margin:0;">Official Competition Sponsors &amp; Partners</h3>',
        '        <div class="inline-actions">',
        '          <a ng-href="/sponsors?competition={{ vm.comp.slug }}" class="btn btn-sm btn-secondary">All Sponsors &rarr;</a>',
        '          <a ng-href="/partners?competition={{ vm.comp.slug }}" class="btn btn-sm btn-secondary">All Partners &rarr;</a>',
        '        </div>',
        '      </div>',
        '      <div class="sp-home-partner-strip">',
        '        <a ng-repeat="sp in vm.comp.sponsors | limitTo:6" ng-href="{{ sp.profile_path }}" class="sp-home-partner-chip">',
        '          <th-brand-mark org="sp" size="sm"></th-brand-mark>',
        '          <div style="min-width:0;"><strong>{{ sp.name }}</strong><span>{{ sp.tier_or_category_label }}</span></div>',
        '        </a>',
        '        <a ng-repeat="pt in vm.comp.partners | limitTo:4" ng-href="{{ pt.profile_path }}" class="sp-home-partner-chip">',
        '          <th-brand-mark org="pt" size="sm"></th-brand-mark>',
        '          <div style="min-width:0;"><strong>{{ pt.name }}</strong><span>{{ pt.tier_or_category_label }} Partner</span></div>',
        '        </a>',
        '      </div>',
        '    </div>',
        '  </div>',
        '</div>'
      ].join(''));
    }]);
})();
