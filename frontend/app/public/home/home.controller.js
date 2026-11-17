(function () {
  'use strict';

  var NOMINEE_VISUALS = {
    'ama-gold': {
      image: '/assets/images/talent-ama.jpg',
      videoUrl: '/assets/videos/demo-sample.mp4',
      duration: '3:45',
      genre: 'Afrobeats & Highlife',
      badge: '#1 Ranked • 92.5 Score'
    },
    'kwesi-motion': {
      image: '/assets/images/talent-kwesi.jpg',
      videoUrl: '/assets/videos/demo-sample.mp4',
      duration: '4:12',
      genre: 'Afro-Dance & Choreo',
      badge: '#2 Ranked • 89.0 Score'
    },
    'poetess-esi': {
      image: '/assets/images/talent-esi.jpg',
      videoUrl: '/assets/videos/demo-sample.mp4',
      duration: '2:50',
      genre: 'Spoken Word Poetry',
      badge: '#3 Ranked • 90.0 Score'
    },
    'king-zongo-bars': {
      image: '/assets/images/talent-ibrahim.jpg',
      videoUrl: '/assets/videos/demo-sample.mp4',
      duration: '3:20',
      genre: 'Hip-Hop & Dagbani Rap',
      badge: '#4 Ranked • 86.5 Score'
    },
    'kojo-laughs': {
      image: '/assets/images/talent-kojo.jpg',
      videoUrl: '/assets/videos/demo-sample.mp4',
      duration: '5:00',
      genre: 'Observational Comedy',
      badge: 'Audition Top Pick'
    }
  };

  var CATEGORY_VISUALS = {
    'vocals-music': {
      image: '/assets/images/cat-vocals.jpg',
      badge: '48 Contestants'
    },
    'afro-dance': {
      image: '/assets/images/cat-dance.jpg',
      badge: '32 Crews & Soloists'
    },
    'spoken-word-rap': {
      image: '/assets/images/cat-poetry.jpg',
      badge: '26 Poets & MCs'
    },
    'comedy-theatre': {
      image: '/assets/images/cat-comedy.jpg',
      badge: '18 Acts'
    }
  };

  var DEFAULT_IMAGES = [
    '/assets/images/talent-ama.jpg',
    '/assets/images/talent-kwesi.jpg',
    '/assets/images/talent-esi.jpg',
    '/assets/images/talent-ibrahim.jpg',
    '/assets/images/talent-kojo.jpg'
  ];

  angular.module('talentHuntApp')
    .controller('HomeController', ['ApiService', '$sce', function (ApiService, $sce) {
      var vm = this;
      vm.loading = true;
      vm.data = null;
      vm.openFaq = 0;
      vm.activeVideo = null;
      vm.trustedVideoUrl = null;

      vm.galleryItems = [
        {
          title: 'Live Stage Atmosphere',
          subtitle: 'Packed Regional Audition Showcases',
          image: '/assets/images/gallery-crowd.jpg'
        },
        {
          title: 'Professional Studio Time',
          subtitle: 'Top 3 Finalists Recording Deal',
          image: '/assets/images/gallery-recording.jpg'
        },
        {
          title: 'Afro-Street Dance Battles',
          subtitle: 'Live Quarterfinal Showdowns',
          image: '/assets/images/gallery-dance-battle.jpg'
        },
        {
          title: 'GHS 100,000 Championship Crown',
          subtitle: 'Grand Finale December 2026',
          image: '/assets/images/gallery-trophy.jpg'
        }
      ];

      function resolveNomineeVisual(nominee, idx) {
        var slug = (nominee.public_slug || '').toLowerCase();
        for (var key in NOMINEE_VISUALS) {
          if (slug.indexOf(key) !== -1) {
            return NOMINEE_VISUALS[key];
          }
        }
        return {
          image: DEFAULT_IMAGES[idx % DEFAULT_IMAGES.length],
          videoUrl: '/assets/videos/demo-sample.mp4',
          duration: '3:30',
          genre: nominee.category_name || 'Live Performance',
          badge: 'Top Nominee'
        };
      }

      vm.openVideo = function (item) {
        if (!item) return;
        vm.activeVideo = item;
        var rawUrl = item.videoUrl || '/assets/videos/demo-sample.mp4';
        vm.trustedVideoUrl = $sce.trustAsResourceUrl(rawUrl);
      };

      vm.closeVideo = function () {
        vm.activeVideo = null;
        vm.trustedVideoUrl = null;
      };

      ApiService.get('/public/home').then(function (res) {
        vm.data = res.data;
        vm.loading = false;

        // Decorate categories with images
        if (vm.data && vm.data.active_competition && vm.data.active_competition.categories) {
          vm.data.active_competition.categories.forEach(function (cat) {
            var v = CATEGORY_VISUALS[cat.slug] || { image: '/assets/images/cat-vocals.jpg', badge: 'Active Category' };
            cat.image = v.image;
            cat.badge = v.badge;
          });
        }

        // Decorate featured nominees with imagery & video metadata
        var showcase = [];
        if (vm.data && vm.data.featured_nominees) {
          vm.data.featured_nominees.forEach(function (nominee, idx) {
            var visual = resolveNomineeVisual(nominee, idx);
            nominee.image = visual.image;
            nominee.videoUrl = visual.videoUrl;
            nominee.duration = visual.duration;
            nominee.genre = visual.genre;
            nominee.badge = visual.badge;

            showcase.push({
              title: (nominee.demo && nominee.demo.title) || (nominee.public_name + ' — Audition Demo'),
              performer: nominee.public_name,
              category: nominee.category_name,
              image: visual.image,
              videoUrl: visual.videoUrl,
              duration: visual.duration,
              votes: nominee.public_votes,
              voting_path: nominee.voting_path,
              public_slug: nominee.public_slug,
              badge: visual.badge
            });
          });
        }
        vm.videoShowcase = showcase;

        // Spotlight video entry (Ama Gold by default)
        if (showcase.length > 0) {
          vm.spotlightVideo = showcase[0];
        }
      }, function () {
        vm.loading = false;
      });
    }])
    .run(['$templateCache', function ($templateCache) {
      $templateCache.put('public/home.html', [
        '<div ng-if="vm.loading" class="loading-box container">Loading StageLight Ghana...</div>',
        '<div ng-if="!vm.loading && vm.data">',

        '  <!-- HERO SECTION WITH LIVE STAGE BACKDROP -->',
        '  <section class="hero-section">',
        '    <div class="container hero-grid">',
        '      <div>',
        '        <div class="eyebrow">&#9733; Ghana\'s Premier Auditable Talent Platform</div>',
        '        <h1 class="hero-title">Step Into the Spotlight. Let Your Talent Speak.</h1>',
        '        <p class="hero-subtitle">{{ vm.data.active_competition ? vm.data.active_competition.tagline : "Submit your talent demo, earn official nomination, share your unique voting link, and advance through transparent, ledger-verified rounds." }}</p>',
        '        <div class="hero-cta-row">',
        '          <a href="/portal/submissions/new" class="btn btn-lg btn-gold">Submit Your Talent</a>',
        '          <a href="/nominees" class="btn btn-lg btn-outline-light">Vote for a Nominee</a>',
        '        </div>',
        '        <div class="mt-3 flex-between" style="max-width:480px;color:#cbd5e1;font-size:0.86rem;">',
        '          <span>&#10003; 16 Regions Represented</span>',
        '          <span>&#10003; Immutable Vote Ledger</span>',
        '          <span>&#10003; Mobile Money &amp; Card</span>',
        '        </div>',
        '      </div>',

        '      <!-- SPOTLIGHT CARD WITH VIDEO THUMBNAIL -->',
        '      <div class="spotlight-card" ng-if="vm.data.active_competition">',
        '        <div class="flex-between">',
        '          <th-status-badge status="vm.data.active_competition.status"></th-status-badge>',
        '          <span class="category-badge-pill" style="position:static;">LIVE VOTING</span>',
        '        </div>',
        '        <h3 style="margin-top:8px;">{{ vm.data.active_competition.title }}</h3>',
        '        <p style="color:#cbd5e1;font-size:0.92rem;margin:0 0 10px;">{{ vm.data.active_competition.prize_summary }}</p>',

        '        <!-- FEATURED DEMO VIDEO PREVIEW -->',
        '        <div class="spotlight-video-preview" ng-if="vm.spotlightVideo" ng-click="vm.openVideo(vm.spotlightVideo)">',
        '          <img ng-src="{{ vm.spotlightVideo.image }}" alt="Featured Demo Performance" />',
        '          <div class="video-play-overlay">',
        '            <div class="play-btn-circle">&#9654;</div>',
        '            <div>',
        '              <div style="font-size:0.88rem;color:#fcd34d;">Watch Featured Audition</div>',
        '              <div style="font-size:0.78rem;color:#e2e8f0;">{{ vm.spotlightVideo.performer }} &bull; {{ vm.spotlightVideo.duration }}</div>',
        '            </div>',
        '          </div>',
        '        </div>',

        '        <div class="spotlight-meta">',
        '          <div><strong>Active Round</strong>{{ vm.data.active_round ? vm.data.active_round.name : "Auditions Open" }}</div>',
        '          <div><strong>Vote Price</strong>{{ vm.data.active_competition.unit_vote_price_major | ghsCurrency:vm.data.active_competition.currency }} / vote</div>',
        '          <div><strong>Applications Close</strong>{{ (vm.data.active_competition.applications_close_at | date:"mediumDate") || "Open" }}</div>',
        '          <div><strong>Timezone</strong>{{ vm.data.active_competition.timezone }}</div>',
        '        </div>',
        '        <div class="inline-actions mt-2">',
        '          <a ng-href="/competitions/{{ vm.data.active_competition.slug }}" class="btn btn-sm btn-gold">Competition Details</a>',
        '          <a ng-href="/results/{{ vm.data.active_competition.slug }}" class="btn btn-sm btn-outline-light">View Results</a>',
        '        </div>',
        '      </div>',
        '    </div>',
        '  </section>',

        '  <!-- SPONSOR & GOOGLE ADS LEADERBOARD BANNER -->',
        '  <div class="container mt-3 mb-1">',
        '    <th-ad-banner slot="home_leaderboard" format="leaderboard"></th-ad-banner>',
        '  </div>',

        '  <!-- NEW: LIVE AUDITION DEMOS & VIDEO SHOWCASE -->',
        '  <section class="section" ng-if="vm.videoShowcase.length">',
        '    <div class="container">',
        '      <div class="section-header">',
        '        <div>',
        '          <h2>Live Auditions &amp; Talent Video Demos</h2>',
        '          <p>Watch approved original performances from Ghana\'s top emerging artists and support them with verified votes.</p>',
        '        </div>',
        '        <a href="/nominees" class="btn btn-sm btn-secondary">Explore All Demos &rarr;</a>',
        '      </div>',
        '      <div class="video-showcase-grid">',
        '        <div class="video-card" ng-repeat="video in vm.videoShowcase">',
        '          <div class="video-card-thumb" ng-click="vm.openVideo(video)">',
        '            <img ng-src="{{ video.image }}" alt="{{ video.performer }} audition" />',
        '            <div class="video-category-tag">{{ video.category }}</div>',
        '            <div class="video-duration">{{ video.duration }}</div>',
        '            <div class="video-play-btn">&#9654;</div>',
        '          </div>',
        '          <div class="video-card-body">',
        '            <div>',
        '              <h3 style="margin:0 0 4px;font-size:1.02rem;"><a ng-href="/nominee/{{ video.public_slug }}">{{ video.performer }}</a></h3>',
        '              <p class="muted" style="margin:0 0 10px;font-size:0.86rem;">{{ video.title }}</p>',
        '            </div>',
        '            <div>',
        '              <div class="flex-between mb-2">',
        '                <span class="nominee-votes-pill">&#9733; {{ video.votes | number }} votes</span>',
        '                <span style="font-size:0.78rem;font-weight:700;color:var(--accent);">{{ video.badge }}</span>',
        '              </div>',
        '              <div class="inline-actions" style="width:100%;">',
        '                <button type="button" class="btn btn-sm btn-secondary" style="flex:1;" ng-click="vm.openVideo(video)">&#9654; Watch</button>',
        '                <a ng-href="{{ video.voting_path }}" class="btn btn-sm btn-primary" style="flex:1;">Vote Now</a>',
        '              </div>',
        '            </div>',
        '          </div>',
        '        </div>',
        '      </div>',
        '    </div>',
        '  </section>',

        '  <!-- HOW IT WORKS STEPPER -->',
        '  <section class="section section-alt">',
        '    <div class="container">',
        '      <div class="section-header">',
        '        <div><h2>How StageLight Works</h2><p>From smartphone demo upload to verified championship voting.</p></div>',
        '        <a href="/how-it-works" class="btn btn-sm btn-secondary">Full Guide &rarr;</a>',
        '      </div>',
        '      <div class="steps-grid">',
        '        <div class="step-card"><div class="step-num">1</div><strong>Submit Your Demo</strong><p class="muted mt-1">Upload an original video/audio clip or approved link and accept the rules.</p></div>',
        '        <div class="step-card"><div class="step-num">2</div><strong>Review &amp; Nomination</strong><p class="muted mt-1">Judges score entries and managers nominate qualified acts.</p></div>',
        '        <div class="step-card"><div class="step-num">3</div><strong>Share Unique Link</strong><p class="muted mt-1">Every nominee receives a round-specific voting URL and QR code.</p></div>',
        '        <div class="step-card"><div class="step-num">4</div><strong>Verified Paid Votes</strong><p class="muted mt-1">Supporters vote via Mobile Money or Card; only confirmed payments count.</p></div>',
        '        <div class="step-card"><div class="step-num">5</div><strong>Transparent Rounds</strong><p class="muted mt-1">Published rules and immutable snapshots advance top talent to the Finale.</p></div>',
        '      </div>',
        '    </div>',
        '  </section>',

        '  <!-- FEATURED CATEGORIES WITH PHOTOS -->',
        '  <section class="section" ng-if="vm.data.active_competition && vm.data.active_competition.categories.length">',
        '    <div class="container">',
        '      <div class="section-header">',
        '        <div><h2>Featured Performance Categories</h2><p>Explore Ghana\'s diverse performance disciplines.</p></div>',
        '      </div>',
        '      <div class="grid-4">',
        '        <div class="card category-card" ng-repeat="cat in vm.data.active_competition.categories">',
        '          <div class="category-card-img">',
        '            <img ng-src="{{ cat.image }}" alt="{{ cat.name }}" />',
        '            <span class="category-badge-pill">{{ cat.badge }}</span>',
        '          </div>',
        '          <div class="category-card-body">',
        '            <div>',
        '              <h3 style="margin:0 0 6px;font-size:1.06rem;">{{ cat.name }}</h3>',
        '              <p class="muted" style="margin:0 0 12px;font-size:0.88rem;">{{ cat.description }}</p>',
        '            </div>',
        '            <a ng-href="/nominees?category={{ cat.slug }}" class="btn btn-sm btn-secondary">Browse Nominees &rarr;</a>',
        '          </div>',
        '        </div>',
        '      </div>',
        '    </div>',
        '  </section>',

        '  <!-- FEATURED NOMINEES WITH PORTRAIT BANNERS -->',
        '  <section class="section section-alt">',
        '    <div class="container">',
        '      <div class="section-header">',
        '        <div><h2>Featured Nominees</h2><p>Watch approved demos and cast verified votes in the current round.</p></div>',
        '        <a href="/nominees" class="btn btn-secondary">All Nominees &rarr;</a>',
        '      </div>',
        '      <div class="grid-4" ng-if="vm.data.featured_nominees.length">',
        '        <div class="card nominee-card" ng-repeat="n in vm.data.featured_nominees">',
        '          <div class="nominee-card-banner">',
        '            <img ng-src="{{ n.image }}" alt="{{ n.public_name }}" />',
        '            <div class="nominee-card-banner-overlay">',
        '              <div class="nominee-avatar" style="width:42px;height:42px;font-size:0.95rem;border:2px solid #fff;">{{ n.public_name | initials }}</div>',
        '              <span class="category-badge-pill" style="position:static;">{{ n.category_name }}</span>',
        '            </div>',
        '          </div>',
        '          <div class="nominee-card-content">',
        '            <div>',
        '              <h3 style="margin:0;font-size:1.06rem;"><a ng-href="/nominee/{{ n.public_slug }}">{{ n.public_name }}</a></h3>',
        '              <div class="nominee-meta mb-1">{{ n.location || "Ghana" }} &bull; {{ n.genre }}</div>',
        '              <p style="font-size:0.86rem;color:var(--text-secondary);margin:0 0 10px;">{{ n.tagline || (n.profile_text | limitTo:80) }}</p>',
        '              <button type="button" class="video-preview-trigger" ng-click="vm.openVideo(n)">&#9654; Play Audition Demo</button>',
        '            </div>',
        '            <div>',
        '              <div class="flex-between mb-2">',
        '                <th-status-badge status="n.status"></th-status-badge>',
        '                <span class="nominee-votes-pill" ng-if="n.public_votes !== undefined && n.public_votes !== null">&#9733; {{ n.public_votes | number }} votes</span>',
        '              </div>',
        '              <div class="inline-actions" style="width:100%;">',
        '                <a ng-href="/nominee/{{ n.public_slug }}" class="btn btn-sm btn-secondary" style="flex:1;">Profile</a>',
        '                <a ng-if="n.status === \'ACTIVE\' || n.status === \'QUALIFIED\'" ng-href="{{ n.voting_path }}" class="btn btn-sm btn-primary" style="flex:1;">Vote Now</a>',
        '              </div>',
        '            </div>',
        '          </div>',
        '        </div>',
        '      </div>',
        '    </div>',
        '  </section>',

        '  <!-- IN-FEED BILLBOARD AD BANNER -->',
        '  <div class="container my-3">',
        '    <th-ad-banner slot="home_mid" format="billboard"></th-ad-banner>',
        '  </div>',

        '  <!-- LIVE ROUND LEADERBOARD -->',
        '  <section class="section" ng-if="vm.data.leaderboard && vm.data.leaderboard.entries.length">',
        '    <div class="container">',
        '      <div class="section-header">',
        '        <div><h2>Live Round Leaderboard</h2><p>{{ vm.data.leaderboard.round.name }} &mdash; Ledger-verified totals</p></div>',
        '        <a ng-href="/results/{{ vm.data.active_competition.slug }}" class="btn btn-sm btn-secondary">All Round Results</a>',
        '      </div>',
        '      <div class="card table-responsive">',
        '        <table class="data-table">',
        '          <thead><tr><th>Rank</th><th>Nominee</th><th>Category</th><th>Verified Votes</th><th>Action</th></tr></thead>',
        '          <tbody>',
        '            <tr ng-repeat="row in vm.data.leaderboard.entries">',
        '              <td><strong>#{{ row.rank }}</strong></td>',
        '              <td><a ng-href="/nominee/{{ row.public_slug }}"><strong>{{ row.public_name }}</strong></a></td>',
        '              <td>{{ row.category_name }}</td>',
        '              <td><span class="nominee-votes-pill">{{ row.votes | number }}</span></td>',
        '              <td><a ng-href="/vote/{{ vm.data.active_competition.slug }}/{{ row.voting_slug }}" class="btn btn-sm btn-primary">Vote</a></td>',
        '            </tr>',
        '          </tbody>',
        '        </table>',
        '      </div>',
        '    </div>',
        '  </section>',

        '  <!-- STAGE MOMENTS PHOTO GALLERY -->',
        '  <section class="section section-alt">',
        '    <div class="container">',
        '      <div class="section-header">',
        '        <div>',
        '          <h2>StageLight Moments &amp; Live Energy</h2>',
        '          <p>From regional auditions to studio sessions and the grand championship crown.</p>',
        '        </div>',
        '      </div>',
        '      <div class="gallery-grid">',
        '        <div class="gallery-item" ng-repeat="g in vm.galleryItems">',
        '          <img ng-src="{{ g.image }}" alt="{{ g.title }}" />',
        '          <div class="gallery-caption">',
        '            <strong>{{ g.title }}</strong>',
        '            <span>{{ g.subtitle }}</span>',
        '          </div>',
        '        </div>',
        '      </div>',
        '    </div>',
        '  </section>',

        '  <!-- SECURITY & LEDGER PILLARS -->',
        '  <section class="section">',
        '    <div class="container grid-3">',
        '      <div class="card"><h3>&#128274; Verified Payments Only</h3><p class="muted">Votes are never credited from screenshots or browser redirects. Every vote requires cryptographic webhook &amp; provider verification.</p></div>',
        '      <div class="card"><h3>&#128220; Immutable Vote Ledger</h3><p class="muted">Totals are computed from an append-only ledger. Refunds record auditable reversals rather than silent deletions.</p></div>',
        '      <div class="card"><h3>&#9878; Published Elimination Rules</h3><p class="muted">Progression rules and tie-breakers are published before voting opens and preserved as historical snapshots.</p></div>',
        '    </div>',
        '  </section>',

        '  <!-- OFFICIAL SPONSORS, STRATEGIC PARTNERS & SUPPORTERS SHOWCASE -->',
        '  <section class="section sp-home-section" ng-if="(vm.data.featured_sponsors && vm.data.featured_sponsors.length) || (vm.data.featured_partners && vm.data.featured_partners.length) || (vm.data.featured_supporters && vm.data.featured_supporters.length)">',
        '    <div class="container">',
        '      <div class="section-header">',
        '        <div>',
        '          <h2>Official Sponsors, Ecosystem Partners &amp; Supporters</h2>',
        '          <p>Backed by leading Ghanaian brands, regulated fintech rails, broadcasters, studios, and regional backstage supporters.</p>',
        '        </div>',
        '        <div class="inline-actions">',
        '          <a href="/sponsors" class="btn btn-sm btn-secondary"><th-icon name="gem" size="14"></th-icon><span>Sponsors &amp; Supporters &rarr;</span></a>',
        '          <a href="/partners" class="btn btn-sm btn-secondary"><th-icon name="handshake" size="14"></th-icon><span>Our Partners &rarr;</span></a>',
        '        </div>',
        '      </div>',

        '      <!-- Featured Sponsors Row -->',
        '      <div class="mb-3" ng-if="vm.data.featured_sponsors && vm.data.featured_sponsors.length">',
        '        <div class="sp-home-sublabel">Headline &amp; Season Sponsors</div>',
        '        <div class="grid-4">',
        '          <a ng-repeat="sp in vm.data.featured_sponsors | limitTo:4" ng-href="{{ sp.profile_path }}" class="card sp-home-sponsor-card">',
        '            <div>',
        '              <div class="flex-between mb-2" style="align-items:flex-start;gap:10px;">',
        '                <th-brand-mark org="sp" size="md"></th-brand-mark>',
        '                <span class="sp-tier-pill sp-tier-pill-sm" ng-class="\'sp-tier-\' + (sp.tier_or_category | lowercase)">{{ sp.tier_or_category_label }}</span>',
        '              </div>',
        '              <h3 class="sp-home-org-name">{{ sp.name }}</h3>',
        '              <p class="sp-home-org-desc">{{ sp.contribution_summary || sp.badge_label }}</p>',
        '            </div>',
        '            <span class="sp-home-card-link">View profile &rarr;</span>',
        '          </a>',
        '        </div>',
        '      </div>',

        '      <!-- Strategic Partners Strip -->',
        '      <div class="mb-3" ng-if="vm.data.featured_partners && vm.data.featured_partners.length">',
        '        <div class="sp-home-sublabel">Official Broadcast, Payment, Studio &amp; Community Partners</div>',
        '        <div class="sp-home-partner-strip">',
        '          <a ng-repeat="pt in vm.data.featured_partners" ng-href="{{ pt.profile_path }}" class="sp-home-partner-chip">',
        '            <th-brand-mark org="pt" size="sm"></th-brand-mark>',
        '            <div style="min-width:0;">',
        '              <strong>{{ pt.name }}</strong>',
        '              <span>{{ pt.tier_or_category_label }}</span>',
        '            </div>',
        '          </a>',
        '        </div>',
        '      </div>',

        '      <!-- Regional & Grassroots Supporters Strip -->',
        '      <div class="mb-3" ng-if="vm.data.featured_supporters && vm.data.featured_supporters.length">',
        '        <div class="sp-home-sublabel">Grassroots, Backstage &amp; Regional Supporters</div>',
        '        <div class="sp-home-partner-strip">',
        '          <a ng-repeat="sup in vm.data.featured_supporters" ng-href="{{ sup.profile_path }}" class="sp-home-partner-chip sp-home-supporter-chip">',
        '            <th-brand-mark org="sup" size="sm"></th-brand-mark>',
        '            <div style="min-width:0;">',
        '              <strong>{{ sup.name }}</strong>',
        '              <span>{{ sup.badge_label || "Official Supporter" }}</span>',
        '            </div>',
        '          </a>',
        '        </div>',
        '      </div>',
        '',
        '      <!-- Partner With Us Callout Banner -->',
        '      <div class="sp-home-cta-banner">',
        '        <div>',
        '          <strong>Showcase your brand across Ghana\'s premier talent stage</strong>',
        '          <span>Explore Title, Platinum, Gold &amp; category sponsorships or join our broadcast, tech, studio, and regional supporter network.</span>',
        '        </div>',
        '        <div class="inline-actions">',
        '          <a href="/sponsors?inquire=1" class="btn btn-sm btn-gold"><th-icon name="gem" size="14"></th-icon><span>Sponsor StageLight</span></a>',
        '          <a href="/partners?inquire=1" class="btn btn-sm btn-outline-light"><th-icon name="handshake" size="14"></th-icon><span>Become a Partner</span></a>',
        '        </div>',
        '      </div>',
        '    </div>',
        '  </section>',

        '  <!-- ANNOUNCEMENTS & FAQS -->',
        '  <section class="section section-alt" ng-if="vm.data.announcements.length || vm.data.faqs.length">',
        '    <div class="container grid-2">',
        '      <div>',
        '        <h2>Latest Announcements</h2>',
        '        <div class="card" ng-repeat="ann in vm.data.announcements">',
        '          <div class="muted" style="font-size:0.8rem;">{{ ann.date }}</div>',
        '          <h3 style="margin:4px 0 8px;font-size:1.05rem;">{{ ann.title }}</h3>',
        '          <p class="muted" style="margin:0;">{{ ann.summary }}</p>',
        '        </div>',
        '      </div>',
        '      <div>',
        '        <h2>Frequently Asked Questions</h2>',
        '        <div class="card" ng-repeat="faq in vm.data.faqs" style="cursor:pointer;" ng-click="vm.openFaq = ($index === vm.openFaq ? -1 : $index)">',
        '          <div class="flex-between"><strong>{{ faq.q }}</strong><span>{{ vm.openFaq === $index ? "&minus;" : "+" }}</span></div>',
        '          <p class="muted mt-1" ng-if="vm.openFaq === $index" style="margin-bottom:0;">{{ faq.a }}</p>',
        '        </div>',
        '      </div>',
        '    </div>',
        '  </section>',

        '  <!-- INTERACTIVE VIDEO PLAYER MODAL -->',
        '  <div class="video-modal-backdrop" ng-if="vm.activeVideo" ng-click="vm.closeVideo()">',
        '    <div class="video-modal-dialog" ng-click="$event.stopPropagation()">',
        '      <div class="video-modal-header">',
        '        <div>',
        '          <h3>{{ vm.activeVideo.title }}</h3>',
        '          <div style="font-size:0.84rem;color:#cbd5e1;">{{ vm.activeVideo.performer }} &bull; {{ vm.activeVideo.category }}</div>',
        '        </div>',
        '        <button type="button" class="video-modal-close" ng-click="vm.closeVideo()" aria-label="Close video player">&times;</button>',
        '      </div>',
        '      <div class="video-modal-body">',
        '        <video controls autoplay playsinline ng-src="{{ vm.trustedVideoUrl }}"></video>',
        '      </div>',
        '      <div class="video-modal-footer">',
        '        <div>',
        '          <span class="nominee-votes-pill">&#9733; {{ vm.activeVideo.votes | number }} Verified Votes</span>',
        '          <span style="margin-left:10px;font-size:0.85rem;color:#cbd5e1;">{{ vm.activeVideo.badge }}</span>',
        '        </div>',
        '        <div class="inline-actions">',
        '          <button type="button" class="btn btn-secondary" ng-click="vm.closeVideo()">Close</button>',
        '          <a ng-if="vm.activeVideo.voting_path" ng-href="{{ vm.activeVideo.voting_path }}" class="btn btn-primary">Vote for {{ vm.activeVideo.performer }}</a>',
        '        </div>',
        '      </div>',
        '    </div>',
        '  </div>',

        '</div>'
      ].join(''));
    }]);
})();
