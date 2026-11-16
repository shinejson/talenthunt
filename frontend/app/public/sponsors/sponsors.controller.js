(function () {
  'use strict';

  function scrollToElementById($timeout, elementId) {
    $timeout(function () {
      var el = document.getElementById(elementId);
      if (el && el.scrollIntoView) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 80, false);
  }

  angular.module('talentHuntApp')
    .controller('SponsorsPageController', ['$location', '$timeout', 'ApiService', 'ToastService',
      function ($location, $timeout, ApiService, ToastService) {
        var vm = this;
        var initialSearch = $location.search() || {};

        vm.loading = true;
        vm.sponsors = [];
        vm.titleSponsors = [];
        vm.tierGroups = [];
        vm.tiers = [];
        vm.packages = [];
        vm.competitions = [];
        vm.stats = { total_sponsors: 0, total_partners: 0, filtered_count: 0, counts_by_tier: {} };

        vm.filters = {
          tier: initialSearch.tier ? String(initialSearch.tier).toUpperCase() : '',
          competition: initialSearch.competition || '',
          q: initialSearch.q || ''
        };

        vm.budgetOptions = [
          'GHS 250,000+ (Title Sponsorship)',
          'GHS 120,000 - GHS 240,000 (Platinum)',
          'GHS 50,000 - GHS 115,000 (Gold)',
          'GHS 15,000 - GHS 45,000 (Silver / Supporting)',
          'Value-in-Kind / Product & Service Sponsorship',
          'Custom Multi-Round Package (Discuss with Team)'
        ];

        function freshInquiry(tierCode) {
          return {
            inquiry_type: 'SPONSOR',
            organization_name: '',
            contact_name: '',
            contact_role: '',
            contact_email: '',
            contact_phone: '',
            website_url: '',
            location: '',
            desired_tier_or_category: tierCode || 'GOLD',
            competition_id: '',
            budget_range: '',
            goals_message: ''
          };
        }

        vm.inquiry = freshInquiry(initialSearch.apply_tier || '');
        vm.submitting = false;
        vm.submittedInquiry = null;

        function buildGroups() {
          var byTier = {};
          vm.sponsors.forEach(function (sp) {
            var code = sp.tier_or_category || 'SUPPORTING';
            if (!byTier[code]) byTier[code] = [];
            byTier[code].push(sp);
          });

          vm.titleSponsors = byTier.TITLE || [];
          var groups = [];
          (vm.tiers || []).forEach(function (tierMeta) {
            if (tierMeta.code === 'TITLE') return;
            var list = byTier[tierMeta.code] || [];
            if (list.length) {
              groups.push({
                meta: tierMeta,
                items: list,
                gridClass: (tierMeta.code === 'PLATINUM' || tierMeta.code === 'GOLD') ? 'grid-2' : 'grid-3'
              });
            }
          });
          vm.tierGroups = groups;
        }

        vm.hasActiveFilters = function () {
          return Boolean(vm.filters.tier || vm.filters.competition || (vm.filters.q && vm.filters.q.trim()));
        };

        vm.selectTier = function (code) {
          vm.filters.tier = (vm.filters.tier === code) ? '' : code;
          vm.load();
        };

        vm.resetFilters = function () {
          vm.filters = { tier: '', competition: '', q: '' };
          vm.load();
        };

        vm.tierCount = function (code) {
          return (vm.stats && vm.stats.counts_by_tier && vm.stats.counts_by_tier[code]) || 0;
        };

        vm.load = function () {
          var params = {};
          if (vm.filters.tier) params.tier = vm.filters.tier;
          if (vm.filters.competition) params.competition = vm.filters.competition;
          if (vm.filters.q && vm.filters.q.trim()) params.q = vm.filters.q.trim();

          ApiService.get('/sponsors', params).then(function (res) {
            var d = res.data || {};
            vm.sponsors = d.sponsors || [];
            vm.tiers = d.tiers || [];
            vm.packages = d.packages || [];
            vm.competitions = d.competitions || [];
            vm.stats = d.stats || vm.stats;
            if (!vm.inquiry.competition_id && vm.competitions.length) {
              vm.inquiry.competition_id = vm.competitions[0].id;
            }
            buildGroups();
            vm.loading = false;

            if (initialSearch.inquire || initialSearch.apply_tier) {
              initialSearch = {};
              scrollToElementById($timeout, 'sponsor-inquiry');
            }
          }, function () {
            vm.loading = false;
          });
        };

        vm.scrollToInquiry = function (pkg) {
          vm.submittedInquiry = null;
          if (pkg && pkg.tier) {
            vm.inquiry.desired_tier_or_category = pkg.tier;
            if (pkg.investment) {
              vm.inquiry.budget_range = pkg.investment;
            }
          }
          scrollToElementById($timeout, 'sponsor-inquiry');
        };

        vm.submitInquiry = function () {
          vm.submitting = true;
          ApiService.post('/public/partnership-inquiries', vm.inquiry).then(function (res) {
            vm.submitting = false;
            vm.submittedInquiry = res.data;
            ToastService.success('Sponsorship inquiry submitted: ' + res.data.reference_no);
          }, function (err) {
            vm.submitting = false;
            ToastService.error(err.message || 'Could not submit sponsorship inquiry.');
          });
        };

        vm.startAnotherInquiry = function () {
          vm.submittedInquiry = null;
          vm.inquiry = freshInquiry('GOLD');
          if (vm.competitions.length) {
            vm.inquiry.competition_id = vm.competitions[0].id;
          }
        };

        vm.load();
      }
    ])
    .controller('PartnersPageController', ['$location', '$timeout', 'ApiService', 'ToastService',
      function ($location, $timeout, ApiService, ToastService) {
        var vm = this;
        var initialSearch = $location.search() || {};

        vm.loading = true;
        vm.partners = [];
        vm.categoryGroups = [];
        vm.categories = [];
        vm.tracks = [];
        vm.competitions = [];
        vm.stats = { total_partners: 0, total_sponsors: 0, filtered_count: 0, counts_by_category: {} };

        vm.filters = {
          category: initialSearch.category ? String(initialSearch.category).toUpperCase() : '',
          competition: initialSearch.competition || '',
          q: initialSearch.q || ''
        };

        vm.collaborationModels = [
          'Broadcast, Radio or Digital Media Syndication',
          'Payment Gateway, Fintech or Audit Integration',
          'Recording Studio, Label or Live Production Support',
          'Concert Arena, Regional Venue or Hospitality Hosting',
          'Cloud, Telecom or Connectivity Infrastructure',
          'Regional Talent Scouting, Campus or Youth Hub'
        ];

        function freshInquiry(catCode) {
          return {
            inquiry_type: 'PARTNER',
            organization_name: '',
            contact_name: '',
            contact_role: '',
            contact_email: '',
            contact_phone: '',
            website_url: '',
            location: '',
            desired_tier_or_category: catCode || 'BROADCAST_MEDIA',
            competition_id: '',
            budget_range: '',
            goals_message: ''
          };
        }

        vm.inquiry = freshInquiry(initialSearch.apply_category || '');
        vm.submitting = false;
        vm.submittedInquiry = null;

        function buildGroups() {
          var byCat = {};
          vm.partners.forEach(function (pt) {
            var code = pt.tier_or_category || 'COMMUNITY_YOUTH';
            if (!byCat[code]) byCat[code] = [];
            byCat[code].push(pt);
          });
          var groups = [];
          (vm.categories || []).forEach(function (catMeta) {
            var list = byCat[catMeta.code] || [];
            if (list.length) {
              groups.push({ meta: catMeta, items: list });
            }
          });
          vm.categoryGroups = groups;
        }

        vm.hasActiveFilters = function () {
          return Boolean(vm.filters.category || vm.filters.competition || (vm.filters.q && vm.filters.q.trim()));
        };

        vm.selectCategory = function (code) {
          vm.filters.category = (vm.filters.category === code) ? '' : code;
          vm.load();
        };

        vm.resetFilters = function () {
          vm.filters = { category: '', competition: '', q: '' };
          vm.load();
        };

        vm.categoryCount = function (code) {
          return (vm.stats && vm.stats.counts_by_category && vm.stats.counts_by_category[code]) || 0;
        };

        vm.load = function () {
          var params = {};
          if (vm.filters.category) params.category = vm.filters.category;
          if (vm.filters.competition) params.competition = vm.filters.competition;
          if (vm.filters.q && vm.filters.q.trim()) params.q = vm.filters.q.trim();

          ApiService.get('/partners', params).then(function (res) {
            var d = res.data || {};
            vm.partners = d.partners || [];
            vm.categories = d.categories || [];
            vm.tracks = d.collaboration_tracks || [];
            vm.competitions = d.competitions || [];
            vm.stats = d.stats || vm.stats;
            if (!vm.inquiry.competition_id && vm.competitions.length) {
              vm.inquiry.competition_id = vm.competitions[0].id;
            }
            buildGroups();
            vm.loading = false;

            if (initialSearch.inquire || initialSearch.apply_category) {
              initialSearch = {};
              scrollToElementById($timeout, 'partner-inquiry');
            }
          }, function () {
            vm.loading = false;
          });
        };

        vm.scrollToInquiry = function (catCode, modelLabel) {
          vm.submittedInquiry = null;
          if (catCode) {
            vm.inquiry.desired_tier_or_category = catCode;
          }
          if (modelLabel) {
            vm.inquiry.budget_range = modelLabel;
          }
          scrollToElementById($timeout, 'partner-inquiry');
        };

        vm.submitInquiry = function () {
          vm.submitting = true;
          ApiService.post('/public/partnership-inquiries', vm.inquiry).then(function (res) {
            vm.submitting = false;
            vm.submittedInquiry = res.data;
            ToastService.success('Partnership proposal submitted: ' + res.data.reference_no);
          }, function (err) {
            vm.submitting = false;
            ToastService.error(err.message || 'Could not submit partnership proposal.');
          });
        };

        vm.startAnotherInquiry = function () {
          vm.submittedInquiry = null;
          vm.inquiry = freshInquiry('BROADCAST_MEDIA');
          if (vm.competitions.length) {
            vm.inquiry.competition_id = vm.competitions[0].id;
          }
        };

        vm.load();
      }
    ])
    .controller('OrgDetailController', ['$routeParams', '$location', 'ApiService',
      function ($routeParams, $location, ApiService) {
        var vm = this;
        vm.isSponsor = $location.path().indexOf('/sponsors/') === 0;
        vm.loading = true;
        vm.error = null;
        vm.org = null;
        vm.related = [];

        vm.displayDomain = function (url) {
          if (!url) return '';
          return String(url).replace(/^https?:\/\/(www\.)?/i, '').replace(/\/+$/, '');
        };

        var endpoint = (vm.isSponsor ? '/sponsors/' : '/partners/') + encodeURIComponent($routeParams.slug || '');
        ApiService.get(endpoint).then(function (res) {
          vm.org = res.data.organization;
          vm.related = res.data.related || [];
          vm.loading = false;
        }, function (err) {
          vm.error = err.message || 'Profile not found.';
          vm.loading = false;
        });
      }
    ])
    .run(['$templateCache', function ($templateCache) {
      /* =========================================================
       * OFFICIAL SPONSORS PAGE (/sponsors)
       * ========================================================= */
      $templateCache.put('public/sponsors.html', [
        '<section class="sp-hero sp-hero-sponsors">',
        '  <div class="container">',
        '    <div class="sp-hero-grid">',
        '      <div>',
        '        <div class="eyebrow"><th-icon name="gem" size="14"></th-icon><span>Official Competition Sponsors</span></div>',
        '        <h1 class="hero-title">Powering Ghana\'s Next Generation of Stage Icons</h1>',
        '        <p class="hero-subtitle">Meet the forward-thinking Ghanaian and pan-African brands funding championship prizes, free regional audition tours, artist mentorship, and live national broadcasts on StageLight.</p>',
        '        <div class="hero-cta-row">',
        '          <button type="button" class="btn btn-lg btn-gold" ng-click="vm.scrollToInquiry()"><th-icon name="gem" size="17"></th-icon><span>Become a Sponsor</span></button>',
        '          <a href="/partners" class="btn btn-lg btn-outline-light"><th-icon name="handshake" size="17"></th-icon><span>Explore Strategic Partners</span></a>',
        '        </div>',
        '      </div>',
        '      <div class="sp-metrics-grid">',
        '        <div class="sp-metric-card"><strong>GHS 100K+</strong><span>Championship Prize Pool &amp; Category Awards</span></div>',
        '        <div class="sp-metric-card"><strong>{{ vm.stats.total_sponsors || 0 }} Brands</strong><span>Official Season &amp; Platform Sponsors</span></div>',
        '        <div class="sp-metric-card"><strong>16 Regions</strong><span>Nationwide Talent Reach Across Ghana</span></div>',
        '        <div class="sp-metric-card"><strong>100% Audited</strong><span>Cryptographically Verified Vote Ledger</span></div>',
        '      </div>',
        '    </div>',
        '  </div>',
        '</section>',

        '<!-- DIRECTORY SWITCHER & TIER FILTERS -->',
        '<section class="section" style="padding-bottom:24px;">',
        '  <div class="container">',
        '    <div class="sp-directory-tabs mb-3" role="navigation" aria-label="Sponsors and Partners Directory">',
        '      <a href="/sponsors" class="sp-dir-tab active"><th-icon name="gem" size="16"></th-icon><span>Official Sponsors</span><span class="sp-dir-count">{{ vm.stats.total_sponsors }}</span></a>',
        '      <a href="/partners" class="sp-dir-tab"><th-icon name="handshake" size="16"></th-icon><span>Strategic Partners</span><span class="sp-dir-count">{{ vm.stats.total_partners }}</span></a>',
        '    </div>',

        '    <div class="sp-filter-panel">',
        '      <div class="sp-pill-row" role="group" aria-label="Filter by sponsorship tier">',
        '        <button type="button" class="sp-filter-pill" ng-class="{active: !vm.filters.tier}" ng-click="vm.filters.tier = \'\'; vm.load()">All Tiers <span>{{ vm.stats.total_sponsors }}</span></button>',
        '        <button type="button" class="sp-filter-pill" ng-repeat="t in vm.tiers" ng-class="{active: vm.filters.tier === t.code}" ng-click="vm.selectTier(t.code)">',
        '          {{ t.label }} <span>{{ vm.tierCount(t.code) }}</span>',
        '        </button>',
        '      </div>',
        '      <div class="sp-filter-controls">',
        '        <div class="search-input-wrap" style="flex:2 1 220px;">',
        '          <th-icon name="search" size="15"></th-icon>',
        '          <input type="text" class="form-control form-control-sm" ng-model="vm.filters.q" ng-model-options="{ debounce: 220 }" ng-change="vm.load()" placeholder="Search sponsors by brand, impact, or city..." />',
        '        </div>',
        '        <select class="form-control form-control-sm" style="flex:1 1 200px;" ng-model="vm.filters.competition" ng-change="vm.load()" ng-if="vm.competitions.length">',
        '          <option value="">All Competitions &amp; Platform-Wide</option>',
        '          <option ng-repeat="c in vm.competitions" value="{{ c.slug }}">{{ c.title }}</option>',
        '        </select>',
        '        <button type="button" class="btn btn-sm btn-secondary" ng-if="vm.hasActiveFilters()" ng-click="vm.resetFilters()"><th-icon name="rotate-ccw" size="14"></th-icon><span>Reset</span></button>',
        '      </div>',
        '    </div>',
        '  </div>',
        '</section>',

        '<div ng-if="vm.loading" class="container loading-box">Loading official StageLight sponsors...</div>',

        '<div ng-if="!vm.loading">',
        '  <!-- EMPTY STATE -->',
        '  <section class="container mb-3" ng-if="!vm.sponsors.length">',
        '    <div class="card empty-state" style="padding:40px 24px;">',
        '      <h3 style="margin:0 0 8px;">No sponsors match your current view</h3>',
        '      <p class="muted" style="margin:0 0 16px;">{{ vm.hasActiveFilters() ? "Try clearing your tier or search filters to view all official sponsors." : "Our sponsorship roster for the upcoming season is currently opening." }}</p>',
        '      <div class="inline-actions" style="justify-content:center;">',
        '        <button type="button" class="btn btn-secondary" ng-if="vm.hasActiveFilters()" ng-click="vm.resetFilters()">Clear Filters</button>',
        '        <button type="button" class="btn btn-primary" ng-click="vm.scrollToInquiry()">Inquire About Sponsorship</button>',
        '      </div>',
        '    </div>',
        '  </section>',

        '  <!-- HEADLINE TITLE SPONSOR SPOTLIGHT -->',
        '  <section class="container mb-3" ng-if="vm.titleSponsors.length">',
        '    <div class="sp-tier-heading">',
        '      <span class="sp-tier-pill sp-tier-title">&#9733; Title Sponsor</span>',
        '      <span class="muted">Official headline presenter underwriting the StageLight Championship Crown</span>',
        '    </div>',
        '    <article class="sp-title-card" ng-repeat="sp in vm.titleSponsors">',
        '      <div class="sp-title-card-brand">',
        '        <th-brand-mark org="sp" size="xl"></th-brand-mark>',
        '        <div>',
        '          <div class="sp-role-kicker">{{ sp.badge_label }}</div>',
        '          <h2 class="sp-title-card-name"><a ng-href="{{ sp.profile_path }}">{{ sp.name }}</a></h2>',
        '          <div class="sp-meta-row">',
        '            <span ng-if="sp.location"><th-icon name="map-pin" size="13"></th-icon> {{ sp.location }}</span>',
        '            <span ng-if="sp.since_year"><th-icon name="award" size="13"></th-icon> Sponsor since {{ sp.since_year }}</span>',
        '            <span><th-icon name="trophy" size="13"></th-icon> {{ sp.scope_label }}</span>',
        '          </div>',
        '        </div>',
        '      </div>',
        '      <p class="sp-lead-tagline" ng-if="sp.tagline">{{ sp.tagline }}</p>',
        '      <p class="sp-body-copy" ng-if="sp.description">{{ sp.description }}</p>',
        '      <div class="sp-contribution-bar" ng-if="sp.contribution_summary">',
        '        <th-icon name="star" size="16"></th-icon>',
        '        <div><strong>Season Impact:</strong> {{ sp.contribution_summary }}</div>',
        '      </div>',
        '      <div class="sp-highlights-grid" ng-if="sp.highlights && sp.highlights.length">',
        '        <div class="sp-highlight-chip" ng-repeat="h in sp.highlights track by $index">',
        '          <th-icon name="check-circle" size="15"></th-icon><span>{{ h }}</span>',
        '        </div>',
        '      </div>',
        '      <blockquote class="sp-quote" ng-if="sp.quote_text">',
        '        <p>&ldquo;{{ sp.quote_text }}&rdquo;</p>',
        '        <footer ng-if="sp.quote_author">&mdash; {{ sp.quote_author }}, {{ sp.name }}</footer>',
        '      </blockquote>',
        '      <div class="inline-actions mt-2">',
        '        <a ng-href="{{ sp.profile_path }}" class="btn btn-primary"><span>View Sponsor Profile</span><th-icon name="arrow-right" size="15"></th-icon></a>',
        '        <a ng-if="sp.website_url" ng-href="{{ sp.website_url }}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary"><span>Visit Official Website</span><th-icon name="external-link" size="14"></th-icon></a>',
        '      </div>',
        '    </article>',
        '  </section>',

        '  <!-- TIERED SPONSOR GROUPS (PLATINUM, GOLD, SILVER, SUPPORTING) -->',
        '  <section class="container sp-tier-section" ng-repeat="group in vm.tierGroups">',
        '    <div class="sp-tier-heading">',
        '      <span class="sp-tier-pill" ng-class="\'sp-tier-\' + (group.meta.code | lowercase)">{{ group.meta.plural_label }}</span>',
        '      <span class="muted">{{ group.meta.description }}</span>',
        '    </div>',
        '    <div ng-class="group.gridClass">',
        '      <article class="card sp-org-card" ng-repeat="sp in group.items">',
        '        <div>',
        '          <div class="sp-org-card-top">',
        '            <th-brand-mark org="sp" size="lg"></th-brand-mark>',
        '            <div style="min-width:0;flex:1;">',
        '              <span class="sp-tier-pill sp-tier-pill-sm" ng-class="\'sp-tier-\' + (sp.tier_or_category | lowercase)">{{ sp.tier_or_category_label }}</span>',
        '              <h3 class="sp-org-name"><a ng-href="{{ sp.profile_path }}">{{ sp.name }}</a></h3>',
        '              <div class="sp-org-role">{{ sp.badge_label }}</div>',
        '            </div>',
        '          </div>',
        '          <p class="sp-org-tagline" ng-if="sp.tagline">{{ sp.tagline }}</p>',
        '          <div class="sp-contribution-mini" ng-if="sp.contribution_summary">{{ sp.contribution_summary }}</div>',
        '          <ul class="sp-mini-list" ng-if="sp.highlights && sp.highlights.length">',
        '            <li ng-repeat="h in sp.highlights | limitTo:3 track by $index"><th-icon name="check-circle" size="14"></th-icon><span>{{ h }}</span></li>',
        '          </ul>',
        '        </div>',
        '        <div class="sp-org-card-footer">',
        '          <div class="sp-meta-row mb-2">',
        '            <span ng-if="sp.location"><th-icon name="map-pin" size="13"></th-icon> {{ sp.location }}</span>',
        '            <span ng-if="sp.since_year">Since {{ sp.since_year }}</span>',
        '          </div>',
        '          <div class="inline-actions" style="width:100%;">',
        '            <a ng-href="{{ sp.profile_path }}" class="btn btn-sm btn-secondary" style="flex:1;">Sponsor Profile</a>',
        '            <a ng-if="sp.website_url" ng-href="{{ sp.website_url }}" target="_blank" rel="noopener noreferrer" class="btn btn-sm btn-primary" style="flex:1;"><span>Website</span><th-icon name="external-link" size="13"></th-icon></a>',
        '          </div>',
        '        </div>',
        '      </article>',
        '    </div>',
        '  </section>',

        '  <!-- SPONSORSHIP PACKAGES & TIER BENEFITS -->',
        '  <section class="section section-alt mt-3" ng-if="vm.packages.length">',
        '    <div class="container">',
        '      <div class="section-header">',
        '        <div>',
        '          <h2>Sponsorship Tiers &amp; Brand Packages</h2>',
        '          <p>Align your brand with Ghana\'s most trusted talent stage. Custom cash and value-in-kind activations available.</p>',
        '        </div>',
        '        <a href="/competitions" class="btn btn-sm btn-secondary">View Active Competitions &rarr;</a>',
        '      </div>',
        '      <div class="grid-4">',
        '        <div class="card sp-package-card" ng-repeat="pkg in vm.packages" ng-class="{\'is-featured\': pkg.is_featured}">',
        '          <div>',
        '            <div class="flex-between mb-1">',
        '              <span class="sp-tier-pill sp-tier-pill-sm" ng-class="\'sp-tier-\' + (pkg.tier | lowercase)">{{ pkg.name }}</span>',
        '              <span class="sp-slot-tag">{{ pkg.availability }}</span>',
        '            </div>',
        '            <div class="sp-package-price">{{ pkg.investment }}</div>',
        '            <p class="muted" style="font-size:0.87rem;margin:8px 0 14px;">{{ pkg.summary }}</p>',
        '            <ul class="sp-mini-list">',
        '              <li ng-repeat="b in pkg.benefits track by $index"><th-icon name="check-circle" size="14"></th-icon><span>{{ b }}</span></li>',
        '            </ul>',
        '          </div>',
        '          <button type="button" class="btn btn-block mt-2" ng-class="pkg.is_featured ? \'btn-primary\' : \'btn-secondary\'" ng-click="vm.scrollToInquiry(pkg)">',
        '            <span>Inquire About {{ pkg.name }}</span>',
        '          </button>',
        '        </div>',
        '      </div>',
        '    </div>',
        '  </section>',

        '  <!-- BECOME A SPONSOR INQUIRY SECTION -->',
        '  <section class="section" id="sponsor-inquiry">',
        '    <div class="container">',
        '      <div class="sp-inquiry-layout">',
        '        <div class="sp-inquiry-pitch">',
        '          <div class="eyebrow"><th-icon name="mail" size="13"></th-icon><span>Sponsorship Desk &bull; Accra</span></div>',
        '          <h2>Sponsor StageLight Ghana</h2>',
        '          <p style="color:#cbd5e1;margin:0 0 18px;">Connect your brand with passionate performers, university campuses, and engaged voters across all 16 regions of Ghana — backed by full ledger auditability and live broadcast reach.</p>',
        '          <ul class="sp-pitch-list">',
        '            <li><th-icon name="shield" size="16"></th-icon><div><strong>Brand-Safe, Audited Voting</strong><span>Every vote is verified via signed payment settlement — protecting sponsor credibility.</span></div></li>',
        '            <li><th-icon name="trophy" size="16"></th-icon><div><strong>Category &amp; Round Ownership</strong><span>Name a performance category, regional audition showcase, or special finalist award.</span></div></li>',
        '            <li><th-icon name="bar-chart" size="16"></th-icon><div><strong>Measurable Audience Impact</strong><span>Receive full post-round reach, livestream, fan-zone, and engagement reporting.</span></div></li>',
        '          </ul>',
        '          <div class="sp-crosslink-box">',
        '            <strong>Proposing media, tech, venue, or studio support?</strong>',
        '            <p>Explore our ecosystem partners and submit a strategic partnership proposal instead.</p>',
        '            <a href="/partners?inquire=1" class="btn btn-sm btn-outline-light"><th-icon name="handshake" size="14"></th-icon><span>Go to Strategic Partners &rarr;</span></a>',
        '          </div>',
        '        </div>',

        '        <div class="card sp-inquiry-form-card">',
        '          <div ng-if="vm.submittedInquiry" class="sp-inquiry-success">',
        '            <div class="sp-success-icon"><th-icon name="check-circle" size="28"></th-icon></div>',
        '            <h3>Sponsorship Inquiry Received!</h3>',
        '            <p class="muted">Thank you for your interest in sponsoring StageLight Ghana, <strong>{{ vm.submittedInquiry.organization_name }}</strong>. Our Commercial &amp; Sponsorships team in Accra will reach out within 2 business days with our full season media kit.</p>',
        '            <div class="alert alert-success" style="text-align:left;">',
        '              <div><strong>Reference Code:</strong> <code>{{ vm.submittedInquiry.reference_no }}</code></div>',
        '              <div ng-if="vm.submittedInquiry.desired_label"><strong>Selected Tier:</strong> {{ vm.submittedInquiry.desired_label }}</div>',
        '            </div>',
        '            <button type="button" class="btn btn-secondary" ng-click="vm.startAnotherInquiry()">Submit Another Inquiry</button>',
        '          </div>',

        '          <form ng-if="!vm.submittedInquiry" ng-submit="vm.submitInquiry()">',
        '            <h3 style="margin:0 0 4px;">Request Sponsorship Deck &amp; Proposal</h3>',
        '            <p class="muted" style="margin:0 0 18px;font-size:0.89rem;">Share your brand goals and preferred tier — our partnerships team will prepare a tailored package.</p>',
        '            <div class="grid-2">',
        '              <div class="form-group"><label class="form-label">Brand / Organization Name *</label><input type="text" class="form-control" ng-model="vm.inquiry.organization_name" placeholder="e.g. CocoaRoyale Ghana Ltd." required /></div>',
        '              <div class="form-group"><label class="form-label">Preferred Sponsorship Tier</label>',
        '                <select class="form-control" ng-model="vm.inquiry.desired_tier_or_category">',
        '                  <option ng-repeat="t in vm.tiers" value="{{ t.code }}">{{ t.label }}</option>',
        '                </select>',
        '              </div>',
        '            </div>',
        '            <div class="grid-2">',
        '              <div class="form-group"><label class="form-label">Contact Person *</label><input type="text" class="form-control" ng-model="vm.inquiry.contact_name" placeholder="Full name" required /></div>',
        '              <div class="form-group"><label class="form-label">Role / Title</label><input type="text" class="form-control" ng-model="vm.inquiry.contact_role" placeholder="e.g. Head of Brand &amp; Marketing" /></div>',
        '            </div>',
        '            <div class="grid-2">',
        '              <div class="form-group"><label class="form-label">Business Email *</label><input type="email" class="form-control" ng-model="vm.inquiry.contact_email" placeholder="sponsorships@company.com.gh" required /></div>',
        '              <div class="form-group"><label class="form-label">Phone Number</label><input type="tel" class="form-control" ng-model="vm.inquiry.contact_phone" placeholder="+233 24 000 0000" /></div>',
        '            </div>',
        '            <div class="grid-2">',
        '              <div class="form-group"><label class="form-label">Company Website</label><input type="url" class="form-control" ng-model="vm.inquiry.website_url" placeholder="https://yourbrand.com.gh" /></div>',
        '              <div class="form-group"><label class="form-label">City / Region</label><input type="text" class="form-control" ng-model="vm.inquiry.location" placeholder="e.g. Accra, Greater Accra" /></div>',
        '            </div>',
        '            <div class="grid-2">',
        '              <div class="form-group"><label class="form-label">Target Competition</label>',
        '                <select class="form-control" ng-model="vm.inquiry.competition_id">',
        '                  <option value="">All Seasons / Platform-Wide</option>',
        '                  <option ng-repeat="c in vm.competitions" value="{{ c.id }}">{{ c.title }}</option>',
        '                </select>',
        '              </div>',
        '              <div class="form-group"><label class="form-label">Estimated Investment Range</label>',
        '                <select class="form-control" ng-model="vm.inquiry.budget_range">',
        '                  <option value="">Select range (optional)</option>',
        '                  <option ng-repeat="b in vm.budgetOptions" value="{{ b }}">{{ b }}</option>',
        '                </select>',
        '              </div>',
        '            </div>',
        '            <div class="form-group">',
        '              <label class="form-label">Sponsorship Goals &amp; Activation Ideas *</label>',
        '              <textarea class="form-control" rows="4" ng-model="vm.inquiry.goals_message" placeholder="Tell us about your target audience, preferred category or round, timeline, and any prize or fan-zone activation ideas..." required></textarea>',
        '            </div>',
        '            <button type="submit" class="btn btn-primary btn-lg btn-block" ng-disabled="vm.submitting">',
        '              {{ vm.submitting ? "Submitting Inquiry..." : "Submit Sponsorship Inquiry" }}',
        '            </button>',
        '          </form>',
        '        </div>',
        '      </div>',
        '    </div>',
        '  </section>',
        '</div>'
      ].join(''));

      /* =========================================================
       * STRATEGIC PARTNERS PAGE (/partners)
       * ========================================================= */
      $templateCache.put('public/partners.html', [
        '<section class="sp-hero sp-hero-partners">',
        '  <div class="container">',
        '    <div class="sp-hero-grid">',
        '      <div>',
        '        <div class="eyebrow sp-eyebrow-emerald"><th-icon name="handshake" size="14"></th-icon><span>Official Ecosystem &amp; Strategic Partners</span></div>',
        '        <h1 class="hero-title">The Trusted Partners Behind Every Audition, Broadcast &amp; Verified Vote</h1>',
        '        <p class="hero-subtitle">StageLight Ghana runs on a collaborative network of regulated fintech gateways, national broadcasters, recording studios, concert arenas, cloud engineers, and grassroots youth foundations across all 16 regions.</p>',
        '        <div class="hero-cta-row">',
        '          <button type="button" class="btn btn-lg btn-gold" ng-click="vm.scrollToInquiry()"><th-icon name="handshake" size="17"></th-icon><span>Become a Partner</span></button>',
        '          <a href="/sponsors" class="btn btn-lg btn-outline-light"><th-icon name="gem" size="17"></th-icon><span>View Official Sponsors</span></a>',
        '        </div>',
        '      </div>',
        '      <div class="sp-metrics-grid">',
        '        <div class="sp-metric-card"><strong>{{ vm.stats.total_partners || 0 }} Partners</strong><span>Active Ecosystem Organizations</span></div>',
        '        <div class="sp-metric-card"><strong>6 Pillars</strong><span>Fintech, Media, Studio, Venue, Cloud &amp; Youth</span></div>',
        '        <div class="sp-metric-card"><strong>HMAC Ledger</strong><span>Verified Mobile Money &amp; Card Rails</span></div>',
        '        <div class="sp-metric-card"><strong>38+ Hubs</strong><span>Campus &amp; Regional Audition Clinics</span></div>',
        '      </div>',
        '    </div>',
        '  </div>',
        '</section>',

        '<!-- DIRECTORY SWITCHER & CATEGORY FILTERS -->',
        '<section class="section" style="padding-bottom:24px;">',
        '  <div class="container">',
        '    <div class="sp-directory-tabs mb-3" role="navigation" aria-label="Sponsors and Partners Directory">',
        '      <a href="/sponsors" class="sp-dir-tab"><th-icon name="gem" size="16"></th-icon><span>Official Sponsors</span><span class="sp-dir-count">{{ vm.stats.total_sponsors }}</span></a>',
        '      <a href="/partners" class="sp-dir-tab active"><th-icon name="handshake" size="16"></th-icon><span>Strategic Partners</span><span class="sp-dir-count">{{ vm.stats.total_partners }}</span></a>',
        '    </div>',

        '    <div class="sp-filter-panel">',
        '      <div class="sp-pill-row" role="group" aria-label="Filter by partner category">',
        '        <button type="button" class="sp-filter-pill" ng-class="{active: !vm.filters.category}" ng-click="vm.filters.category = \'\'; vm.load()">All Partners <span>{{ vm.stats.total_partners }}</span></button>',
        '        <button type="button" class="sp-filter-pill" ng-repeat="cat in vm.categories" ng-class="{active: vm.filters.category === cat.code}" ng-click="vm.selectCategory(cat.code)">',
        '          <th-icon name="{{ cat.icon || \'globe\' }}" size="13"></th-icon> {{ cat.label }} <span>{{ vm.categoryCount(cat.code) }}</span>',
        '        </button>',
        '      </div>',
        '      <div class="sp-filter-controls">',
        '        <div class="search-input-wrap" style="flex:2 1 220px;">',
        '          <th-icon name="search" size="15"></th-icon>',
        '          <input type="text" class="form-control form-control-sm" ng-model="vm.filters.q" ng-model-options="{ debounce: 220 }" ng-change="vm.load()" placeholder="Search partners by name, capability, or city..." />',
        '        </div>',
        '        <select class="form-control form-control-sm" style="flex:1 1 200px;" ng-model="vm.filters.competition" ng-change="vm.load()" ng-if="vm.competitions.length">',
        '          <option value="">All Competitions &amp; Platform-Wide</option>',
        '          <option ng-repeat="c in vm.competitions" value="{{ c.slug }}">{{ c.title }}</option>',
        '        </select>',
        '        <button type="button" class="btn btn-sm btn-secondary" ng-if="vm.hasActiveFilters()" ng-click="vm.resetFilters()"><th-icon name="rotate-ccw" size="14"></th-icon><span>Reset</span></button>',
        '      </div>',
        '    </div>',
        '  </div>',
        '</section>',

        '<div ng-if="vm.loading" class="container loading-box">Loading official StageLight partners...</div>',

        '<div ng-if="!vm.loading">',
        '  <!-- EMPTY STATE -->',
        '  <section class="container mb-3" ng-if="!vm.partners.length">',
        '    <div class="card empty-state" style="padding:40px 24px;">',
        '      <h3 style="margin:0 0 8px;">No partners match your current filter</h3>',
        '      <p class="muted" style="margin:0 0 16px;">{{ vm.hasActiveFilters() ? "Reset your category or search filters to browse the full StageLight partner ecosystem." : "We are actively onboarding strategic partners for the season." }}</p>',
        '      <div class="inline-actions" style="justify-content:center;">',
        '        <button type="button" class="btn btn-secondary" ng-if="vm.hasActiveFilters()" ng-click="vm.resetFilters()">Clear Filters</button>',
        '        <button type="button" class="btn btn-primary" ng-click="vm.scrollToInquiry()">Propose a Partnership</button>',
        '      </div>',
        '    </div>',
        '  </section>',

        '  <!-- PARTNER ECOSYSTEM GROUPS -->',
        '  <section class="container sp-tier-section" ng-repeat="group in vm.categoryGroups">',
        '    <div class="sp-category-header">',
        '      <div class="sp-category-icon"><th-icon name="{{ group.meta.icon || \'globe\' }}" size="20"></th-icon></div>',
        '      <div>',
        '        <h2>{{ group.meta.label }}</h2>',
        '        <p class="muted">{{ group.meta.description }}</p>',
        '      </div>',
        '    </div>',
        '    <div ng-class="group.items.length === 1 ? \'sp-partner-single-grid\' : \'grid-2\'">',
        '      <article class="card sp-partner-card" ng-repeat="pt in group.items">',
        '        <div>',
        '          <div class="sp-org-card-top">',
        '            <th-brand-mark org="pt" size="lg"></th-brand-mark>',
        '            <div style="min-width:0;flex:1;">',
        '              <span class="sp-partner-cat-badge"><th-icon name="{{ pt.category_icon || \'globe\' }}" size="12"></th-icon> {{ pt.tier_or_category_label }}</span>',
        '              <h3 class="sp-org-name"><a ng-href="{{ pt.profile_path }}">{{ pt.name }}</a></h3>',
        '              <div class="sp-org-role">{{ pt.badge_label }}</div>',
        '            </div>',
        '          </div>',
        '          <p class="sp-org-tagline" ng-if="pt.tagline">{{ pt.tagline }}</p>',
        '          <p class="muted" style="font-size:0.9rem;margin:0 0 12px;" ng-if="pt.description">{{ pt.description }}</p>',
        '          <div class="sp-contribution-mini sp-contribution-emerald" ng-if="pt.contribution_summary">',
        '            <strong>Ecosystem Role:</strong> {{ pt.contribution_summary }}',
        '          </div>',
        '          <ul class="sp-mini-list" ng-if="pt.highlights && pt.highlights.length">',
        '            <li ng-repeat="h in pt.highlights track by $index"><th-icon name="check-circle" size="14"></th-icon><span>{{ h }}</span></li>',
        '          </ul>',
        '          <blockquote class="sp-quote sp-quote-compact" ng-if="pt.quote_text">',
        '            <p>&ldquo;{{ pt.quote_text }}&rdquo;</p>',
        '            <footer ng-if="pt.quote_author">&mdash; {{ pt.quote_author }}</footer>',
        '          </blockquote>',
        '        </div>',
        '        <div class="sp-org-card-footer">',
        '          <div class="sp-meta-row mb-2">',
        '            <span ng-if="pt.location"><th-icon name="map-pin" size="13"></th-icon> {{ pt.location }}</span>',
        '            <span ng-if="pt.since_year"><th-icon name="award" size="13"></th-icon> Partner since {{ pt.since_year }}</span>',
        '            <span><th-icon name="layers" size="13"></th-icon> {{ pt.scope_label }}</span>',
        '          </div>',
        '          <div class="inline-actions">',
        '            <a ng-href="{{ pt.profile_path }}" class="btn btn-sm btn-secondary"><span>Partner Profile</span><th-icon name="arrow-right" size="14"></th-icon></a>',
        '            <a ng-if="pt.website_url" ng-href="{{ pt.website_url }}" target="_blank" rel="noopener noreferrer" class="btn btn-sm btn-primary"><span>Visit Website</span><th-icon name="external-link" size="13"></th-icon></a>',
        '          </div>',
        '        </div>',
        '      </article>',
        '    </div>',
        '  </section>',

        '  <!-- COLLABORATION TRACKS -->',
        '  <section class="section section-alt mt-3" ng-if="vm.tracks.length">',
        '    <div class="container">',
        '      <div class="section-header">',
        '        <div>',
        '          <h2>How Organizations Partner With StageLight</h2>',
        '          <p>We collaborate across media, infrastructure, artist development, and grassroots creative communities.</p>',
        '        </div>',
        '        <a href="/how-it-works" class="btn btn-sm btn-secondary">Platform Overview &rarr;</a>',
        '      </div>',
        '      <div class="grid-2">',
        '        <div class="card sp-track-card" ng-repeat="tr in vm.tracks">',
        '          <div>',
        '            <div class="sp-track-head">',
        '              <div class="sp-category-icon"><th-icon name="{{ tr.icon || \'handshake\' }}" size="19"></th-icon></div>',
        '              <h3 style="margin:0;font-size:1.1rem;">{{ tr.title }}</h3>',
        '            </div>',
        '            <p class="muted" style="margin:10px 0 12px;font-size:0.9rem;">{{ tr.summary }}</p>',
        '            <ul class="sp-mini-list">',
        '              <li ng-repeat="d in tr.deliverables track by $index"><th-icon name="check-circle" size="14"></th-icon><span>{{ d }}</span></li>',
        '            </ul>',
        '          </div>',
        '          <div class="mt-2">',
        '            <button type="button" class="btn btn-sm btn-secondary" ng-click="vm.scrollToInquiry(tr.category, tr.title)"><span>Propose Collaboration</span><th-icon name="arrow-right" size="14"></th-icon></button>',
        '          </div>',
        '        </div>',
        '      </div>',
        '    </div>',
        '  </section>',

        '  <!-- BECOME A PARTNER INQUIRY SECTION -->',
        '  <section class="section" id="partner-inquiry">',
        '    <div class="container">',
        '      <div class="sp-inquiry-layout">',
        '        <div class="sp-inquiry-pitch sp-inquiry-pitch-emerald">',
        '          <div class="eyebrow sp-eyebrow-emerald"><th-icon name="handshake" size="13"></th-icon><span>Ecosystem &amp; Alliances</span></div>',
        '          <h2>Become a Strategic Partner</h2>',
        '          <p style="color:#cbd5e1;margin:0 0 18px;">Whether you operate a regional FM station, recording studio, live performance venue, fintech service, or youth arts collective, let\'s build lasting pathways for Ghanaian performers together.</p>',
        '          <ul class="sp-pitch-list">',
        '            <li><th-icon name="radio" size="16"></th-icon><div><strong>Authentic Cultural Content</strong><span>Co-create live performance sessions, audition diaries, and winner spotlights.</span></div></li>',
        '            <li><th-icon name="mic" size="16"></th-icon><div><strong>Direct Talent Pipeline</strong><span>Mentor, record, and book vetted vocalists, dancers, poets, and comedians.</span></div></li>',
        '            <li><th-icon name="users" size="16"></th-icon><div><strong>16-Region Grassroots Footprint</strong><span>Bring digital audition access and creative workshops to your community.</span></div></li>',
        '          </ul>',
        '          <div class="sp-crosslink-box">',
        '            <strong>Looking for headline or category brand sponsorship?</strong>',
        '            <p>View our Title, Platinum, Gold, and Silver sponsorship packages and pricing.</p>',
        '            <a href="/sponsors?inquire=1" class="btn btn-sm btn-outline-light"><th-icon name="gem" size="14"></th-icon><span>Explore Sponsorship Packages &rarr;</span></a>',
        '          </div>',
        '        </div>',

        '        <div class="card sp-inquiry-form-card">',
        '          <div ng-if="vm.submittedInquiry" class="sp-inquiry-success">',
        '            <div class="sp-success-icon"><th-icon name="check-circle" size="28"></th-icon></div>',
        '            <h3>Partnership Proposal Received!</h3>',
        '            <p class="muted">Thank you, <strong>{{ vm.submittedInquiry.organization_name }}</strong>. Our Ecosystem Partnerships team has logged your proposal and will follow up shortly.</p>',
        '            <div class="alert alert-success" style="text-align:left;">',
        '              <div><strong>Reference Code:</strong> <code>{{ vm.submittedInquiry.reference_no }}</code></div>',
        '              <div ng-if="vm.submittedInquiry.desired_label"><strong>Partnership Pillar:</strong> {{ vm.submittedInquiry.desired_label }}</div>',
        '            </div>',
        '            <button type="button" class="btn btn-secondary" ng-click="vm.startAnotherInquiry()">Submit Another Proposal</button>',
        '          </div>',

        '          <form ng-if="!vm.submittedInquiry" ng-submit="vm.submitInquiry()">',
        '            <h3 style="margin:0 0 4px;">Submit a Partnership Proposal</h3>',
        '            <p class="muted" style="margin:0 0 18px;font-size:0.89rem;">Tell us about your organization and how we can collaborate across upcoming StageLight rounds.</p>',
        '            <div class="grid-2">',
        '              <div class="form-group"><label class="form-label">Organization Name *</label><input type="text" class="form-control" ng-model="vm.inquiry.organization_name" placeholder="e.g. BeatWave Africa Studios" required /></div>',
        '              <div class="form-group"><label class="form-label">Partnership Category</label>',
        '                <select class="form-control" ng-model="vm.inquiry.desired_tier_or_category">',
        '                  <option ng-repeat="cat in vm.categories" value="{{ cat.code }}">{{ cat.label }}</option>',
        '                </select>',
        '              </div>',
        '            </div>',
        '            <div class="grid-2">',
        '              <div class="form-group"><label class="form-label">Contact Person *</label><input type="text" class="form-control" ng-model="vm.inquiry.contact_name" placeholder="Full name" required /></div>',
        '              <div class="form-group"><label class="form-label">Role / Title</label><input type="text" class="form-control" ng-model="vm.inquiry.contact_role" placeholder="e.g. Director of Partnerships" /></div>',
        '            </div>',
        '            <div class="grid-2">',
        '              <div class="form-group"><label class="form-label">Work Email *</label><input type="email" class="form-control" ng-model="vm.inquiry.contact_email" placeholder="partners@organization.gh" required /></div>',
        '              <div class="form-group"><label class="form-label">Phone Number</label><input type="tel" class="form-control" ng-model="vm.inquiry.contact_phone" placeholder="+233 24 000 0000" /></div>',
        '            </div>',
        '            <div class="grid-2">',
        '              <div class="form-group"><label class="form-label">Website</label><input type="url" class="form-control" ng-model="vm.inquiry.website_url" placeholder="https://organization.gh" /></div>',
        '              <div class="form-group"><label class="form-label">City / Region(s)</label><input type="text" class="form-control" ng-model="vm.inquiry.location" placeholder="e.g. Kumasi &amp; Accra" /></div>',
        '            </div>',
        '            <div class="grid-2">',
        '              <div class="form-group"><label class="form-label">Competition Scope</label>',
        '                <select class="form-control" ng-model="vm.inquiry.competition_id">',
        '                  <option value="">Platform-Wide / Ongoing</option>',
        '                  <option ng-repeat="c in vm.competitions" value="{{ c.id }}">{{ c.title }}</option>',
        '                </select>',
        '              </div>',
        '              <div class="form-group"><label class="form-label">Collaboration Model</label>',
        '                <select class="form-control" ng-model="vm.inquiry.budget_range">',
        '                  <option value="">Select model (optional)</option>',
        '                  <option ng-repeat="m in vm.collaborationModels" value="{{ m }}">{{ m }}</option>',
        '                </select>',
        '              </div>',
        '            </div>',
        '            <div class="form-group">',
        '              <label class="form-label">Proposed Collaboration &amp; Capabilities *</label>',
        '              <textarea class="form-control" rows="4" ng-model="vm.inquiry.goals_message" placeholder="Describe how your organization would like to collaborate with StageLight — media reach, studio facilities, venue capacity, technical capabilities, or regional network..." required></textarea>',
        '            </div>',
        '            <button type="submit" class="btn btn-primary btn-lg btn-block" ng-disabled="vm.submitting">',
        '              {{ vm.submitting ? "Submitting Proposal..." : "Submit Partnership Proposal" }}',
        '            </button>',
        '          </form>',
        '        </div>',
        '      </div>',
        '    </div>',
        '  </section>',
        '</div>'
      ].join(''));

      /* =========================================================
       * INDIVIDUAL SPONSOR / PARTNER DETAIL PAGE (/sponsors/:slug & /partners/:slug)
       * ========================================================= */
      $templateCache.put('public/org-detail.html', [
        '<div ng-if="vm.loading" class="container loading-box mt-3">Loading profile...</div>',
        '<div ng-if="!vm.loading && vm.error" class="container mt-3 mb-3">',
        '  <div class="card empty-state" style="padding:40px 24px;">',
        '    <h2 style="margin:0 0 8px;">{{ vm.error }}</h2>',
        '    <p class="muted" style="margin:0 0 18px;">This profile may have been archived or moved.</p>',
        '    <div class="inline-actions" style="justify-content:center;">',
        '      <a href="/sponsors" class="btn btn-primary">Browse Official Sponsors</a>',
        '      <a href="/partners" class="btn btn-secondary">Browse Strategic Partners</a>',
        '    </div>',
        '  </div>',
        '</div>',

        '<div ng-if="!vm.loading && vm.org">',
        '  <section class="sp-detail-hero" ng-class="vm.isSponsor ? \'sp-hero-sponsors\' : \'sp-hero-partners\'">',
        '    <div class="container">',
        '      <a ng-href="{{ vm.isSponsor ? \'/sponsors\' : \'/partners\' }}" class="sp-back-link">',
        '        <th-icon name="arrow-left" size="15"></th-icon>',
        '        <span>{{ vm.isSponsor ? "All Official Sponsors" : "All Strategic Partners" }}</span>',
        '      </a>',
        '      <div class="sp-detail-header">',
        '        <th-brand-mark org="vm.org" size="xl"></th-brand-mark>',
        '        <div style="flex:1;min-width:0;">',
        '          <div class="inline-actions mb-1">',
        '            <span ng-if="vm.isSponsor" class="sp-tier-pill" ng-class="\'sp-tier-\' + (vm.org.tier_or_category | lowercase)">{{ vm.org.tier_or_category_label }}</span>',
        '            <span ng-if="!vm.isSponsor" class="sp-partner-cat-badge sp-partner-cat-badge-dark"><th-icon name="{{ vm.org.category_icon || \'globe\' }}" size="13"></th-icon> {{ vm.org.tier_or_category_label }}</span>',
        '            <span class="sp-detail-role">{{ vm.org.badge_label }}</span>',
        '          </div>',
        '          <h1 class="sp-detail-title">{{ vm.org.name }}</h1>',
        '          <p class="sp-detail-tagline" ng-if="vm.org.tagline">{{ vm.org.tagline }}</p>',
        '          <div class="hero-cta-row mt-2">',
        '            <a ng-if="vm.org.website_url" ng-href="{{ vm.org.website_url }}" target="_blank" rel="noopener noreferrer" class="btn btn-gold"><span>Visit Official Website</span><th-icon name="external-link" size="15"></th-icon></a>',
        '            <a ng-if="vm.org.competition_slug" ng-href="/competitions/{{ vm.org.competition_slug }}" class="btn btn-outline-light"><th-icon name="trophy" size="15"></th-icon><span>View Competition</span></a>',
        '            <a ng-href="{{ vm.isSponsor ? \'/sponsors?inquire=1\' : \'/partners?inquire=1\' }}" class="btn btn-outline-light"><th-icon name="mail" size="15"></th-icon><span>{{ vm.isSponsor ? "Sponsor With Us" : "Partner With Us" }}</span></a>',
        '          </div>',
        '        </div>',
        '      </div>',
        '    </div>',
        '  </section>',

        '  <section class="section">',
        '    <div class="container sp-detail-grid">',
        '      <div>',
        '        <div class="card">',
        '          <h2 style="margin-top:0;font-size:1.3rem;">About {{ vm.org.name }}</h2>',
        '          <p style="color:var(--text-secondary);font-size:1rem;line-height:1.7;margin:0;">{{ vm.org.description || vm.org.tagline || "Official StageLight Ghana organization supporting emerging talent and transparent public voting." }}</p>',
        '          <div class="sp-contribution-bar mt-3" ng-if="vm.org.contribution_summary">',
        '            <th-icon name="award" size="18"></th-icon>',
        '            <div><strong>{{ vm.isSponsor ? "Sponsorship Contribution:" : "Ecosystem Role:" }}</strong> {{ vm.org.contribution_summary }}</div>',
        '          </div>',
        '        </div>',

        '        <div class="card" ng-if="vm.org.highlights && vm.org.highlights.length">',
        '          <h3 style="margin-top:0;">Key Highlights &amp; Deliverables</h3>',
        '          <div class="sp-highlights-grid">',
        '            <div class="sp-highlight-chip" ng-repeat="h in vm.org.highlights track by $index">',
        '              <th-icon name="check-circle" size="16"></th-icon><span>{{ h }}</span>',
        '            </div>',
        '          </div>',
        '        </div>',

        '        <div class="card" ng-if="vm.org.quote_text">',
        '          <h3 style="margin-top:0;">Partner Perspective</h3>',
        '          <blockquote class="sp-quote" style="margin:0;">',
        '            <p>&ldquo;{{ vm.org.quote_text }}&rdquo;</p>',
        '            <footer ng-if="vm.org.quote_author">&mdash; {{ vm.org.quote_author }}, {{ vm.org.name }}</footer>',
        '          </blockquote>',
        '        </div>',
        '      </div>',

        '      <aside>',
        '        <div class="card">',
        '          <h3 style="margin-top:0;font-size:1.05rem;">Profile Overview</h3>',
        '          <dl class="sp-facts-list">',
        '            <div><dt>Relationship</dt><dd>{{ vm.isSponsor ? "Official Sponsor" : "Strategic Partner" }}</dd></div>',
        '            <div><dt>{{ vm.isSponsor ? "Sponsorship Tier" : "Partner Pillar" }}</dt><dd>{{ vm.org.tier_or_category_label }}</dd></div>',
        '            <div ng-if="vm.org.badge_label"><dt>Designation</dt><dd>{{ vm.org.badge_label }}</dd></div>',
        '            <div><dt>Scope</dt><dd><a ng-if="vm.org.competition_slug" ng-href="/competitions/{{ vm.org.competition_slug }}">{{ vm.org.competition_title }}</a><span ng-if="!vm.org.competition_slug">{{ vm.org.scope_label }}</span></dd></div>',
        '            <div ng-if="vm.org.location"><dt>Location</dt><dd>{{ vm.org.location }}</dd></div>',
        '            <div ng-if="vm.org.since_year"><dt>Active Since</dt><dd>{{ vm.org.since_year }}</dd></div>',
        '            <div ng-if="vm.org.website_url"><dt>Website</dt><dd><a ng-href="{{ vm.org.website_url }}" target="_blank" rel="noopener noreferrer">{{ vm.displayDomain(vm.org.website_url) }} &#8599;</a></dd></div>',
        '          </dl>',
        '        </div>',
        '        <div class="card" style="background:var(--bg-subtle);">',
        '          <h4 style="margin:0 0 6px;">See the Talent in Action</h4>',
        '          <p class="muted" style="font-size:0.88rem;margin:0 0 12px;">Watch original audition demos from shortlisted nominees across Ghana and cast verified votes.</p>',
        '          <div class="inline-actions">',
        '            <a href="/nominees" class="btn btn-sm btn-primary">Meet Nominees</a>',
        '            <a href="/results" class="btn btn-sm btn-secondary">Live Results</a>',
        '          </div>',
        '        </div>',
        '      </aside>',
        '    </div>',
        '  </section>',

        '  <section class="section section-alt" ng-if="vm.related.length">',
        '    <div class="container">',
        '      <div class="section-header">',
        '        <div><h2>More {{ vm.isSponsor ? "Official Sponsors" : "Strategic Partners" }}</h2></div>',
        '        <div class="inline-actions">',
        '          <a ng-href="{{ vm.isSponsor ? \'/sponsors\' : \'/partners\' }}" class="btn btn-sm btn-secondary">View All {{ vm.isSponsor ? "Sponsors" : "Partners" }} &rarr;</a>',
        '          <a ng-href="{{ vm.isSponsor ? \'/partners\' : \'/sponsors\' }}" class="btn btn-sm btn-secondary">{{ vm.isSponsor ? "Strategic Partners" : "Official Sponsors" }} &rarr;</a>',
        '        </div>',
        '      </div>',
        '      <div class="grid-4">',
        '        <a ng-repeat="r in vm.related" ng-href="{{ r.profile_path }}" class="card sp-related-card">',
        '          <div class="sp-org-card-top" style="margin-bottom:8px;">',
        '            <th-brand-mark org="r" size="sm"></th-brand-mark>',
        '            <div style="min-width:0;">',
        '              <strong style="display:block;color:var(--text-main);font-size:0.95rem;">{{ r.name }}</strong>',
        '              <span class="muted" style="font-size:0.78rem;">{{ r.tier_or_category_label }}</span>',
        '            </div>',
        '          </div>',
        '          <p class="muted" style="font-size:0.83rem;margin:0;">{{ r.badge_label }}</p>',
        '        </a>',
        '      </div>',
        '    </div>',
        '  </section>',
        '</div>'
      ].join(''));
    }]);
})();
