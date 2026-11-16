(function () {
  'use strict';

  angular.module('talentHuntApp')
    .controller('InfoPagesController', ['$location', 'ApiService', 'ToastService',
      function ($location, ApiService, ToastService) {
        var vm = this;
        vm.page = $location.path().replace('/', '') || 'how-it-works';
        vm.info = null;
        vm.ticket = { category: 'PAYMENT', contact_name: '', contact_email: '', contact_phone: '', order_reference: '', subject: '', message: '' };
        vm.submittedTicket = null;
        vm.submitting = false;

        ApiService.get('/public/info').then(function (res) {
          vm.info = res.data;
        });

        vm.submitSupport = function () {
          vm.submitting = true;
          ApiService.post('/public/support', vm.ticket).then(function (res) {
            vm.submitting = false;
            vm.submittedTicket = res.data;
            ToastService.success('Support ticket created: ' + res.data.ticket_reference);
          }, function (err) {
            vm.submitting = false;
            ToastService.error(err.message);
          });
        };
      }
    ])
    .run(['$templateCache', function ($templateCache) {
      $templateCache.put('public/info.html', [
        '<div class="page-header"><div class="container">',
        '  <h1 ng-if="vm.page === \'how-it-works\'">How StageLight Works</h1>',
        '  <h1 ng-if="vm.page === \'rules\'">Official Competition Rules</h1>',
        '  <h1 ng-if="vm.page === \'faq\'">Frequently Asked Questions</h1>',
        '  <h1 ng-if="vm.page === \'contact\'">Voter &amp; Contestant Support</h1>',
        '  <h1 ng-if="vm.page === \'privacy\'">Privacy &amp; Data Protection Notice</h1>',
        '  <h1 ng-if="vm.page === \'terms\'">Terms of Service &amp; Voting Policy</h1>',
        '</div></div>',
        '<div class="container mb-3">',
        '  <div class="card" ng-if="vm.page === \'how-it-works\'">',
        '    <h3>For Talent Applicants &amp; Nominees</h3>',
        '    <ol><li>Create an account and verify your email or Ghana mobile number.</li><li>Select an open competition and category, upload your original demo (MP4, MP3, WAV, MOV, or YouTube/Vimeo link), and accept content rights &amp; guardian consent if under 18.</li><li>Track your review status in your Applicant Portal. If nominated, share your unique round-specific voting link and downloadable QR code!</li></ol>',
        '    <h3>For Public Voters</h3>',
        '    <ol><li>Open a nominee\'s official voting link or pick a contestant from the Nominee Directory.</li><li>Choose a vote package in GHS and complete payment via Mobile Money or Bank Card.</li><li>Once the provider confirms payment via signed webhook, your votes are recorded on the immutable ledger and you receive a StageLight receipt reference (e.g. TH-2026-XXXXXXXX).</li></ol>',
        '    <div class="inline-actions mt-2"><a href="/portal/register" class="btn btn-primary">Create Applicant Account</a><a href="/nominees" class="btn btn-secondary">Browse Nominees</a></div>',
        '  </div>',

        '  <div class="card" ng-if="vm.page === \'rules\'">',
        '    <h3>Eligibility &amp; Fair Voting Rules</h3>',
        '    <p ng-if="vm.info && vm.info.active_eligibility"><strong>Eligibility:</strong> {{ vm.info.active_eligibility }}</p>',
        '    <pre style="white-space:pre-wrap;font-family:inherit;line-height:1.7;">{{ (vm.info && vm.info.active_rules) || "All submissions must be original works. Votes require verified payment confirmation." }}</pre>',
        '  </div>',

        '  <div class="card" ng-if="vm.page === \'faq\'">',
        '    <div ng-repeat="f in (vm.info ? vm.info.faqs : [])" style="padding:12px 0;border-bottom:1px solid var(--border);">',
        '      <h4 style="margin:0 0 6px;">{{ f.q }}</h4><p class="muted" style="margin:0;">{{ f.a }}</p>',
        '    </div>',
        '  </div>',

        '  <div class="card" ng-if="vm.page === \'privacy\'">',
        '    <h3>Data Minimisation &amp; Voter Privacy</h3>',
        '    <p>StageLight collects only the personal data required for competition entry, contact verification, payment reconciliation, fraud prevention, and support in accordance with Ghana Data Protection principles.</p>',
        '    <ul><li><strong>Voter Privacy:</strong> Nominees and the public never see voters\' phone numbers, email addresses, or payment details.</li><li><strong>Public Consent:</strong> Only approved nominee stage names, biographies, and demos with explicit publication consent are displayed publicly.</li><li><strong>Account Control:</strong> Registered users may request profile updates, data export, or account deactivation from their Security Portal.</li></ul>',
        '  </div>',

        '  <div class="card" ng-if="vm.page === \'terms\'">',
        '    <h3>Terms of Participation &amp; Paid Voting</h3>',
        '    <ul><li>Paid votes are digital competition entries credited strictly upon verified provider payment confirmation.</li><li>Pending, failed, cancelled, or mismatched payments generate zero valid votes.</li><li>Confirmed refunds or chargebacks create an auditable reversal entry on the vote ledger.</li><li>Elimination outcomes are governed by the round configuration and tie-breakers published prior to round opening.</li></ul>',
        '  </div>',

        '  <div class="card" ng-if="vm.page === \'contact\'" style="max-width:680px;">',
        '    <div ng-if="vm.submittedTicket" class="alert alert-success">',
        '      <strong>Ticket Received!</strong> Reference: <code>{{ vm.submittedTicket.ticket_reference }}</code>. Our support &amp; finance team will respond promptly.',
        '    </div>',
        '    <form ng-if="!vm.submittedTicket" ng-submit="vm.submitSupport()">',
        '      <div class="grid-2">',
        '        <div class="form-group"><label class="form-label">Your Name *</label><input type="text" class="form-control" ng-model="vm.ticket.contact_name" required /></div>',
        '        <div class="form-group"><label class="form-label">Issue Category</label><select class="form-control" ng-model="vm.ticket.category"><option value="PAYMENT">Pending / Disputed Vote Payment</option><option value="VOTING">Voting Link Issue</option><option value="APPLICATION">Demo Submission</option><option value="GENERAL">General Inquiry</option></select></div>',
        '      </div>',
        '      <div class="grid-2">',
        '        <div class="form-group"><label class="form-label">Phone Number</label><input type="tel" class="form-control" ng-model="vm.ticket.contact_phone" placeholder="+233..." /></div>',
        '        <div class="form-group"><label class="form-label">Email Address</label><input type="email" class="form-control" ng-model="vm.ticket.contact_email" placeholder="you@example.com" /></div>',
        '      </div>',
        '      <div class="form-group"><label class="form-label">Order or Receipt Reference (if payment-related)</label><input type="text" class="form-control" ng-model="vm.ticket.order_reference" placeholder="ORD-2026-... or TH-2026-..." /></div>',
        '      <div class="form-group"><label class="form-label">Subject *</label><input type="text" class="form-control" ng-model="vm.ticket.subject" required /></div>',
        '      <div class="form-group"><label class="form-label">Describe how we can help *</label><textarea class="form-control" ng-model="vm.ticket.message" required></textarea></div>',
        '      <button type="submit" class="btn btn-primary" ng-disabled="vm.submitting">{{ vm.submitting ? "Submitting..." : "Submit Support Ticket" }}</button>',
        '    </form>',
        '  </div>',
        '</div>'
      ].join(''));
    }]);
})();
