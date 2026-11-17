(function () {
  'use strict';

  angular.module('talentHuntApp')
    .component('thFooter', {
      template: [
        '<!-- DEDICATED MODERN ADMIN FOOTER -->',
        '<footer class="admin-footer" ng-if="$ctrl.isAdmin" role="contentinfo">',
        '  <div class="admin-footer-inner">',
        '    <div class="admin-footer-left">',
        '      <span class="admin-sys-status"><span class="status-dot"></span> All Systems Operational</span>',
        '      <span class="footer-sep">&bull;</span>',
        '      <span>StageLight Ghana &mdash; Admin Operations Console v1.0</span>',
        '      <span class="footer-sep">&bull;</span>',
        '      <span class="muted">Accra (GMT+0)</span>',
        '    </div>',
        '    <div class="admin-footer-middle">',
        '      <span class="admin-metric-pill">&#128274; 100% Audit Coverage</span>',
        '      <span class="admin-metric-pill">&#128220; Immutable Ledger</span>',
        '      <span class="admin-metric-pill">&#9878; Top-N Progression</span>',
        '    </div>',
        '    <div class="admin-footer-right">',
        '      <a href="/admin/audit-logs">Audit Trail</a>',
        '      <a href="/admin/reconciliation">Reconciliation</a>',
        '      <a href="/admin/settings">Platform Settings</a>',
        '      <a href="/api/v1/health" target="_blank" rel="noopener noreferrer">API Health</a>',
        '      <a href="/" target="_blank">Public Site &rarr;</a>',
        '    </div>',
        '  </div>',
        '</footer>',

        '<!-- PUBLIC WEBSITE FOOTER -->',
        '<footer class="site-footer" ng-if="!$ctrl.isAdmin" role="contentinfo">',
        '  <div class="container">',
        '    <div class="footer-grid">',
        '      <div>',
        '        <h4>StageLight Talent Hunt</h4>',
        '        <p>Ghana-first talent discovery, auditable public voting, verified Mobile Money &amp; Card payments, and transparent multi-round progression.</p>',
        '        <div class="footer-social-wrap" ng-if="$ctrl.hasSocials()">',
        '          <span class="footer-social-title">Follow &amp; Connect</span>',
        '          <div class="footer-social-links">',
        '            <a ng-if="$ctrl.socials.facebook_url" ng-href="{{$ctrl.socials.facebook_url}}" target="_blank" rel="noopener noreferrer" class="footer-social-btn social-facebook" title="Facebook" aria-label="Facebook">',
        '              <th-icon name="facebook" size="16"></th-icon>',
        '            </a>',
        '            <a ng-if="$ctrl.socials.instagram_url" ng-href="{{$ctrl.socials.instagram_url}}" target="_blank" rel="noopener noreferrer" class="footer-social-btn social-instagram" title="Instagram" aria-label="Instagram">',
        '              <th-icon name="instagram" size="16"></th-icon>',
        '            </a>',
        '            <a ng-if="$ctrl.socials.twitter_url" ng-href="{{$ctrl.socials.twitter_url}}" target="_blank" rel="noopener noreferrer" class="footer-social-btn social-twitter" title="Twitter / X" aria-label="Twitter / X">',
        '              <th-icon name="x-twitter" size="16"></th-icon>',
        '            </a>',
        '            <a ng-if="$ctrl.socials.youtube_url" ng-href="{{$ctrl.socials.youtube_url}}" target="_blank" rel="noopener noreferrer" class="footer-social-btn social-youtube" title="YouTube" aria-label="YouTube">',
        '              <th-icon name="youtube" size="16"></th-icon>',
        '            </a>',
        '            <a ng-if="$ctrl.socials.tiktok_url" ng-href="{{$ctrl.socials.tiktok_url}}" target="_blank" rel="noopener noreferrer" class="footer-social-btn social-tiktok" title="TikTok" aria-label="TikTok">',
        '              <th-icon name="tiktok" size="16"></th-icon>',
        '            </a>',
        '            <a ng-if="$ctrl.socials.whatsapp_number" ng-href="{{$ctrl.getWhatsAppUrl($ctrl.socials.whatsapp_number)}}" target="_blank" rel="noopener noreferrer" class="footer-social-btn social-whatsapp" title="WhatsApp Support" aria-label="WhatsApp">',
        '              <th-icon name="whatsapp" size="16"></th-icon>',
        '            </a>',
        '            <a ng-if="$ctrl.socials.linkedin_url" ng-href="{{$ctrl.socials.linkedin_url}}" target="_blank" rel="noopener noreferrer" class="footer-social-btn social-linkedin" title="LinkedIn" aria-label="LinkedIn">',
        '              <th-icon name="linkedin" size="16"></th-icon>',
        '            </a>',
        '          </div>',
        '        </div>',
        '      </div>',
        '      <div>',
        '        <h4>Explore</h4>',
        '        <ul>',
        '          <li><a href="/competitions">Competitions</a></li>',
        '          <li><a href="/nominees">Meet the Nominees</a></li>',
        '          <li><a href="/results">Published Results</a></li>',
        '          <li><a href="/how-it-works">How It Works</a></li>',
        '        </ul>',
        '      </div>',
        '      <div>',
        '        <h4>Sponsors &amp; Partners</h4>',
        '        <ul>',
        '          <li><a href="/sponsors">Official Sponsors</a></li>',
        '          <li><a href="/partners">Strategic Partners</a></li>',
        '          <li><a href="/sponsors?inquire=1">Become a Sponsor</a></li>',
        '          <li><a href="/partners?inquire=1">Partner With StageLight</a></li>',
        '        </ul>',
        '      </div>',
        '      <div>',
        '        <h4>Rules &amp; Support</h4>',
        '        <ul>',
        '          <li><a href="/rules">Competition Rules</a></li>',
        '          <li><a href="/faq">Frequently Asked Questions</a></li>',
        '          <li><a href="/contact">Payment &amp; Voter Support</a></li>',
        '        </ul>',
        '      </div>',
        '      <div>',
        '        <h4>Legal &amp; Privacy</h4>',
        '        <ul>',
        '          <li><a href="/privacy">Privacy &amp; Data Protection</a></li>',
        '          <li><a href="/terms">Terms of Participation</a></li>',
        '          <li><a href="/portal/login">Contestant &amp; Admin Sign In</a></li>',
        '        </ul>',
        '      </div>',
        '    </div>',
        '    <div class="footer-bottom">',
        '      <span>&copy; 2026 StageLight Ghana. All votes verified against immutable payment ledger.</span>',
        '      <div class="footer-bottom-socials" ng-if="$ctrl.hasSocials()">',
        '        <a ng-if="$ctrl.socials.facebook_url" ng-href="{{$ctrl.socials.facebook_url}}" target="_blank" rel="noopener noreferrer" class="footer-bottom-social-link" title="Facebook"><th-icon name="facebook" size="14"></th-icon></a>',
        '        <a ng-if="$ctrl.socials.instagram_url" ng-href="{{$ctrl.socials.instagram_url}}" target="_blank" rel="noopener noreferrer" class="footer-bottom-social-link" title="Instagram"><th-icon name="instagram" size="14"></th-icon></a>',
        '        <a ng-if="$ctrl.socials.twitter_url" ng-href="{{$ctrl.socials.twitter_url}}" target="_blank" rel="noopener noreferrer" class="footer-bottom-social-link" title="Twitter / X"><th-icon name="x-twitter" size="14"></th-icon></a>',
        '        <a ng-if="$ctrl.socials.youtube_url" ng-href="{{$ctrl.socials.youtube_url}}" target="_blank" rel="noopener noreferrer" class="footer-bottom-social-link" title="YouTube"><th-icon name="youtube" size="14"></th-icon></a>',
        '        <a ng-if="$ctrl.socials.tiktok_url" ng-href="{{$ctrl.socials.tiktok_url}}" target="_blank" rel="noopener noreferrer" class="footer-bottom-social-link" title="TikTok"><th-icon name="tiktok" size="14"></th-icon></a>',
        '        <a ng-if="$ctrl.socials.whatsapp_number" ng-href="{{$ctrl.getWhatsAppUrl($ctrl.socials.whatsapp_number)}}" target="_blank" rel="noopener noreferrer" class="footer-bottom-social-link" title="WhatsApp"><th-icon name="whatsapp" size="14"></th-icon></a>',
        '        <a ng-if="$ctrl.socials.linkedin_url" ng-href="{{$ctrl.socials.linkedin_url}}" target="_blank" rel="noopener noreferrer" class="footer-bottom-social-link" title="LinkedIn"><th-icon name="linkedin" size="14"></th-icon></a>',
        '      </div>',
        '      <span>Accra, Ghana &bull; Currency: GHS</span>',
        '    </div>',
        '  </div>',
        '</footer>'
      ].join(''),
      controller: ['$location', '$rootScope', 'ApiService', function ($location, $rootScope, ApiService) {
        var vm = this;
        vm.socials = {};

        function update() {
          var p = $location.path() || '/';
          vm.isAdmin = p === '/admin' || p.indexOf('/admin/') === 0;
        }

        function loadSocials() {
          ApiService.get('/public/info').then(function (res) {
            var data = (res && res.data) || {};
            vm.socials = data.social_links || {};
          }).catch(function () {
            // fallback
          });
        }

        vm.hasSocials = function () {
          if (!vm.socials) return false;
          return !!(
            vm.socials.facebook_url ||
            vm.socials.instagram_url ||
            vm.socials.twitter_url ||
            vm.socials.youtube_url ||
            vm.socials.tiktok_url ||
            vm.socials.whatsapp_number ||
            vm.socials.linkedin_url
          );
        };

        vm.getWhatsAppUrl = function (val) {
          if (!val) return '';
          if (val.indexOf('http://') === 0 || val.indexOf('https://') === 0) return val;
          var digits = val.replace(/\D/g, '');
          return 'https://wa.me/' + digits;
        };

        update();
        loadSocials();

        $rootScope.$on('$routeChangeSuccess', update);
        $rootScope.$on('platformInfoChanged', loadSocials);
      }]
    });
})();
