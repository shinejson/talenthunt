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
        '      <span>Accra, Ghana &bull; Currency: GHS</span>',
        '    </div>',
        '  </div>',
        '</footer>'
      ].join(''),
      controller: ['$location', '$rootScope', function ($location, $rootScope) {
        var vm = this;
        function update() {
          var p = $location.path() || '/';
          vm.isAdmin = p === '/admin' || p.indexOf('/admin/') === 0;
        }
        update();
        $rootScope.$on('$routeChangeSuccess', update);
      }]
    });
})();
