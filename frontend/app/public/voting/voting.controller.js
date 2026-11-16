(function () {
  'use strict';

  angular.module('talentHuntApp')
    .controller('VotingPageController', ['$routeParams', '$location', '$window', 'ApiService', 'ToastService',
      function ($routeParams, $location, $window, ApiService, ToastService) {
        var vm = this;
        vm.loading = true;
        vm.ctx = null;
        vm.error = null;
        vm.selectedPackage = null;
        vm.useCustomQty = false;
        vm.customQty = 10;
        vm.paymentChannel = 'mobile_money';
        vm.voterName = '';
        vm.voterPhone = '';
        vm.voterEmail = '';
        vm.submitting = false;

        ApiService.get('/vote-links/' + $routeParams.nominee, { competition: $routeParams.competition })
          .then(function (res) {
            vm.ctx = res.data;
            if (vm.ctx.packages && vm.ctx.packages.length) {
              for (var i = 0; i < vm.ctx.packages.length; i++) {
                if (vm.ctx.packages[i].is_featured) {
                  vm.selectedPackage = vm.ctx.packages[i];
                  break;
                }
              }
              if (!vm.selectedPackage) vm.selectedPackage = vm.ctx.packages[0];
            } else {
              vm.useCustomQty = true;
            }
            vm.loading = false;
          }, function (err) {
            vm.error = err.message;
            vm.loading = false;
          });

        vm.selectPackage = function (pkg) {
          vm.useCustomQty = false;
          vm.selectedPackage = pkg;
        };

        vm.enableCustom = function () {
          vm.useCustomQty = true;
          vm.selectedPackage = null;
        };

        vm.effectiveVotes = function () {
          if (!vm.ctx) return 0;
          if (!vm.useCustomQty && vm.selectedPackage) return vm.selectedPackage.vote_quantity;
          return Math.max(0, parseInt(vm.customQty || 0, 10));
        };

        vm.effectiveTotalMajor = function () {
          if (!vm.ctx || !vm.ctx.competition) return 0;
          if (!vm.useCustomQty && vm.selectedPackage) return vm.selectedPackage.price_major;
          return (vm.effectiveVotes() * vm.ctx.competition.unit_vote_price_minor) / 100.0;
        };

        vm.startCheckout = function () {
          if (!vm.ctx || !vm.ctx.can_vote) return;
          vm.submitting = true;
          var targetSlug = vm.ctx.round_entry ? vm.ctx.round_entry.voting_slug : $routeParams.nominee;
          var orderPayload = {
            voting_slug: targetSlug,
            payment_channel: vm.paymentChannel,
            voter_name: vm.voterName || null,
            voter_phone: vm.voterPhone || null,
            voter_email: vm.voterEmail || null
          };
          if (!vm.useCustomQty && vm.selectedPackage) {
            orderPayload.package_id = vm.selectedPackage.id;
          } else {
            orderPayload.vote_quantity = vm.effectiveVotes();
          }

          ApiService.post('/orders', orderPayload).then(function (ordRes) {
            var order = ordRes.data;
            return ApiService.post('/payments/initialize', {
              order_reference: order.public_reference,
              callback_url: $window.location.origin + '/orders/' + order.public_reference
            });
          }).then(function (payRes) {
            vm.submitting = false;
            var checkoutUrl = payRes.data.checkout_url;
            if (checkoutUrl && checkoutUrl.indexOf('http') === 0) {
              $window.location.href = checkoutUrl;
            } else {
              $location.path(checkoutUrl);
            }
          }, function (err) {
            vm.submitting = false;
            ToastService.error(err.message || 'Unable to start payment.');
          });
        };
      }
    ])
    .controller('SandboxCheckoutController', ['$routeParams', '$location', 'ApiService', 'ToastService',
      function ($routeParams, $location, ApiService, ToastService) {
        var vm = this;
        vm.loading = true;
        vm.session = null;
        vm.network = 'MTN Mobile Money';
        vm.processing = false;
        vm.error = null;

        ApiService.get('/payments/sandbox/' + $routeParams.providerRef).then(function (res) {
          vm.session = res.data;
          if (vm.session.order && vm.session.order.payment_channel === 'card') {
            vm.network = 'Visa / Mastercard';
          }
          vm.loading = false;
        }, function (err) {
          vm.error = err.message;
          vm.loading = false;
        });

        vm.complete = function (outcome) {
          vm.processing = true;
          ApiService.post('/payments/sandbox/' + $routeParams.providerRef + '/complete', {
            outcome: outcome,
            network: vm.network
          }).then(function (res) {
            vm.processing = false;
            var orderRef = res.data.order.public_reference;
            if (outcome === 'SUCCESS') {
              ToastService.success('Payment verified via signed webhook! Votes credited.');
            } else {
              ToastService.info('Payment simulation completed (' + res.data.outcome + ').');
            }
            $location.path('/orders/' + orderRef);
          }, function (err) {
            vm.processing = false;
            ToastService.error(err.message);
          });
        };
      }
    ])
    .controller('OrderReceiptController', ['$routeParams', '$window', 'ApiService', 'ToastService',
      function ($routeParams, $window, ApiService, ToastService) {
        var vm = this;
        vm.loading = true;
        vm.order = null;
        vm.error = null;

        vm.refresh = function () {
          ApiService.get('/orders/' + $routeParams.reference).then(function (res) {
            vm.order = res.data;
            vm.loading = false;
          }, function (err) {
            vm.error = err.message;
            vm.loading = false;
          });
        };

        vm.copyReceipt = function () {
          if (vm.order && vm.order.receipt_code && $window.navigator && $window.navigator.clipboard) {
            $window.navigator.clipboard.writeText(vm.order.receipt_code);
            ToastService.success('Receipt code copied!');
          }
        };

        vm.refresh();
      }
    ])
    .run(['$templateCache', function ($templateCache) {
      $templateCache.put('public/voting.html', [
        '<div class="container mt-3 mb-3">',
        '  <div ng-if="vm.loading" class="loading-box">Verifying voting link &amp; round eligibility...</div>',
        '  <div ng-if="vm.error" class="alert alert-danger">{{ vm.error }}</div>',
        '  <div ng-if="vm.ctx">',
        '    <div class="card mb-3">',
        '      <div class="flex-between">',
        '        <div class="nominee-card-top" style="margin-bottom:0;">',
        '          <div class="nominee-avatar">{{ vm.ctx.nominee.public_name | initials }}</div>',
        '          <div>',
        '            <div class="muted" style="font-size:0.84rem;">{{ vm.ctx.competition.title }} &bull; {{ vm.ctx.round ? vm.ctx.round.name : "No Round" }}</div>',
        '            <h1 style="margin:2px 0;font-size:1.6rem;">Vote for {{ vm.ctx.nominee.public_name }}</h1>',
        '            <div class="muted" style="font-size:0.86rem;">Category: {{ vm.ctx.nominee.category_name }}</div>',
        '          </div>',
        '        </div>',
        '        <div class="text-right">',
        '          <th-status-badge status="vm.ctx.round_entry ? vm.ctx.round_entry.status : vm.ctx.nominee.status"></th-status-badge>',
        '          <div class="muted mt-1" style="font-size:0.82rem;" ng-if="vm.ctx.round && vm.ctx.round.voting_closes_at">Round closes: {{ vm.ctx.round.voting_closes_at | date:"medium" }}</div>',
        '        </div>',
        '      </div>',
        '    </div>',

        '    <div class="card" ng-if="!vm.ctx.can_vote">',
        '      <div class="alert alert-warning" style="margin-bottom:14px;">',
        '        <strong>Voting Unavailable on This Link:</strong> {{ vm.ctx.block_reason }}',
        '      </div>',
        '      <p class="muted" ng-if="vm.ctx.is_closed_round_link">Per StageLight fairness rules, links from closed rounds or eliminated entries never silently redirect votes into another round.</p>',
        '      <div class="inline-actions mt-2">',
        '        <a ng-href="{{ vm.ctx.nominee_profile_path }}" class="btn btn-primary">{{ vm.ctx.has_newer_open_round ? "Visit Nominee Profile for Current Open Round" : "View Nominee Profile" }}</a>',
        '        <a ng-href="/results/{{ vm.ctx.competition.slug }}" class="btn btn-secondary">View Published Results</a>',
        '      </div>',
        '    </div>',

        '    <form class="grid-2" ng-if="vm.ctx.can_vote" ng-submit="vm.startCheckout()">',
        '      <div class="card">',
        '        <h3 style="margin-top:0;">1. Select Vote Package</h3>',
        '        <div class="package-grid" ng-if="vm.ctx.packages.length">',
        '          <th-vote-package ng-repeat="pkg in vm.ctx.packages" pkg="pkg" selected="!vm.useCustomQty && vm.selectedPackage && vm.selectedPackage.id === pkg.id" on-select="vm.selectPackage(pkg)"></th-vote-package>',
        '        </div>',
        '        <div ng-if="vm.ctx.competition.allow_custom_quantity" class="mt-2">',
        '          <button type="button" class="btn btn-sm" ng-class="vm.useCustomQty ? \'btn-primary\' : \'btn-secondary\'" ng-click="vm.enableCustom()">Or Enter Custom Vote Quantity</button>',
        '          <div class="form-group mt-2" ng-if="vm.useCustomQty">',
        '            <label class="form-label">Number of Votes ({{ vm.ctx.competition.min_vote_quantity }} &ndash; {{ vm.ctx.competition.max_vote_quantity_per_order }})</label>',
        '            <input type="number" class="form-control" ng-model="vm.customQty" min="{{ vm.ctx.competition.min_vote_quantity }}" max="{{ vm.ctx.competition.max_vote_quantity_per_order }}" />',
        '          </div>',
        '        </div>',

        '        <h3 class="mt-3">2. Payment Method &amp; Receipt Contact</h3>',
        '        <div class="form-group">',
        '          <label class="form-label">Payment Channel</label>',
        '          <select class="form-control" ng-model="vm.paymentChannel">',
        '            <option ng-repeat="ch in vm.ctx.accepted_channels" value="{{ ch.id }}">{{ ch.label }}</option>',
        '          </select>',
        '        </div>',
        '        <div class="grid-2">',
        '          <div class="form-group"><label class="form-label">Mobile Number (for MoMo / SMS receipt)</label><input type="tel" class="form-control" ng-model="vm.voterPhone" placeholder="+233 24 000 0000" /></div>',
        '          <div class="form-group"><label class="form-label">Email (optional receipt)</label><input type="email" class="form-control" ng-model="vm.voterEmail" placeholder="you@example.com" /></div>',
        '        </div>',
        '      </div>',

        '      <div class="card">',
        '        <h3 style="margin-top:0;">3. Trust-First Order Summary</h3>',
        '        <div style="background:var(--bg-subtle);padding:16px;border-radius:8px;margin-bottom:16px;">',
        '          <div class="flex-between mb-1"><span>Contestant</span><strong>{{ vm.ctx.nominee.public_name }}</strong></div>',
        '          <div class="flex-between mb-1"><span>Competition Round</span><strong>{{ vm.ctx.round.name }}</strong></div>',
        '          <div class="flex-between mb-1"><span>Vote Quantity</span><strong>{{ vm.effectiveVotes() | number }} votes</strong></div>',
        '          <div class="flex-between mb-1"><span>Platform Fee</span><strong>{{ 0 | ghsCurrency:vm.ctx.competition.currency }}</strong></div>',
        '          <hr style="border:none;border-top:1px solid var(--border-strong);margin:10px 0;" />',
        '          <div class="flex-between" style="font-size:1.2rem;"><span>Total Payable</span><strong>{{ vm.effectiveTotalMajor() | ghsCurrency:vm.ctx.competition.currency }}</strong></div>',
        '        </div>',
        '        <p class="muted" style="font-size:0.84rem;">By proceeding, you acknowledge the <a href="/rules">Competition Rules</a> and <a href="/terms">Terms</a>. Votes are credited to the ledger strictly after confirmed payment verification from the payment provider.</p>',
        '        <button type="submit" class="btn btn-lg btn-primary btn-block" ng-disabled="vm.submitting || vm.effectiveVotes() < 1">',
        '          {{ vm.submitting ? "Initializing Secure Checkout..." : ("Proceed to Pay " + (vm.effectiveTotalMajor() | ghsCurrency:vm.ctx.competition.currency)) }}',
        '        </button>',
        '      </div>',
        '    </form>',
        '  </div>',
        '</div>'
      ].join(''));

      $templateCache.put('public/sandbox-checkout.html', [
        '<div class="container mt-3 mb-3" style="max-width:620px;">',
        '  <div ng-if="vm.loading" class="loading-box">Loading payment gateway session...</div>',
        '  <div ng-if="vm.error" class="alert alert-danger">{{ vm.error }}</div>',
        '  <div class="card" ng-if="vm.session">',
        '    <div class="flex-between mb-2">',
        '      <span class="status-badge badge-info">&#128274; GhanaPay Hosted Sandbox Gateway</span>',
        '      <span class="muted" style="font-family:monospace;font-size:0.82rem;">{{ vm.session.provider_reference }}</span>',
        '    </div>',
        '    <h2 style="margin:6px 0;">Authorize Vote Payment</h2>',
        '    <p class="muted">Simulated external Mobile Money / Card checkout. Approving dispatches an HMAC-SHA256 signed server-to-server webhook to StageLight.</p>',
        '    <div style="background:var(--bg-subtle);padding:16px;border-radius:8px;margin:16px 0;">',
        '      <div class="flex-between mb-1"><span>Order Reference</span><strong>{{ vm.session.order.public_reference }}</strong></div>',
        '      <div class="flex-between mb-1"><span>Nominee</span><strong>{{ vm.session.order.nominee_name }}</strong></div>',
        '      <div class="flex-between mb-1"><span>Votes Purchased</span><strong>{{ vm.session.order.vote_quantity }} votes</strong></div>',
        '      <div class="flex-between" style="font-size:1.15rem;"><span>Amount</span><strong>{{ vm.session.order.amount_major | ghsCurrency:vm.session.order.currency }}</strong></div>',
        '    </div>',
        '    <div class="form-group">',
        '      <label class="form-label">Select Mobile Money Network / Card</label>',
        '      <select class="form-control" ng-model="vm.network">',
        '        <option ng-repeat="n in vm.session.networks" value="{{ n }}">{{ n }}</option>',
        '      </select>',
        '    </div>',
        '    <button type="button" class="btn btn-lg btn-success btn-block mb-2" ng-disabled="vm.processing" ng-click="vm.complete(\'SUCCESS\')">',
        '      &#10003; Approve &amp; Confirm Payment ({{ vm.session.order.amount_major | ghsCurrency:vm.session.order.currency }})',
        '    </button>',
        '    <div class="grid-2">',
        '      <button type="button" class="btn btn-sm btn-secondary" ng-disabled="vm.processing" ng-click="vm.complete(\'FAILED\')">Simulate Declined Payment</button>',
        '      <button type="button" class="btn btn-sm btn-secondary" ng-disabled="vm.processing" ng-click="vm.complete(\'MISMATCH\')">Simulate Amount Mismatch</button>',
        '    </div>',
        '  </div>',
        '</div>'
      ].join(''));

      $templateCache.put('public/order-receipt.html', [
        '<div class="container mt-3 mb-3" style="max-width:640px;">',
        '  <div ng-if="vm.loading" class="loading-box">Checking payment &amp; vote ledger status...</div>',
        '  <div ng-if="vm.error" class="alert alert-danger">{{ vm.error }}</div>',
        '  <div class="card" ng-if="vm.order">',
        '    <div class="flex-between mb-2">',
        '      <th-status-badge status="vm.order.status"></th-status-badge>',
        '      <span class="muted" style="font-family:monospace;">{{ vm.order.public_reference }}</span>',
        '    </div>',
        '    <div ng-if="vm.order.status === \'PAID\'">',
        '      <h1 style="color:var(--emerald);margin:8px 0;">&#10003; Votes Verified &amp; Recorded!</h1>',
        '      <p class="muted">Thank you! Your payment was verified server-to-server and <strong>{{ vm.order.vote_quantity }}</strong> vote(s) have been committed to the ledger for <strong>{{ vm.order.nominee_name }}</strong>.</p>',
        '      <div class="alert alert-success">',
        '        <div class="flex-between">',
        '          <div><div style="font-size:0.78rem;text-transform:uppercase;">Official Receipt Reference</div><strong style="font-size:1.25rem;font-family:monospace;">{{ vm.order.receipt_code }}</strong></div>',
        '          <button type="button" class="btn btn-sm btn-secondary" ng-click="vm.copyReceipt()">Copy Code</button>',
        '        </div>',
        '      </div>',
        '    </div>',
        '    <div ng-if="vm.order.status === \'PENDING_PAYMENT\'">',
        '      <h2>Payment Pending Confirmation</h2>',
        '      <p class="muted">We are awaiting confirmation from the payment provider. Votes are credited as soon as provider confirmation arrives.</p>',
        '      <button type="button" class="btn btn-secondary mb-2" ng-click="vm.refresh()">Refresh Status</button>',
        '    </div>',
        '    <div ng-if="vm.order.status === \'FAILED\' || vm.order.status === \'QUARANTINED\'">',
        '      <h2 style="color:var(--danger);">Votes Not Credited ({{ vm.order.status }})</h2>',
        '      <p class="muted">This transaction did not pass settlement verification, so zero votes were added. Need help? <a href="/contact">Contact Payment Support</a> with reference <strong>{{ vm.order.public_reference }}</strong>.</p>',
        '    </div>',
        '    <div style="background:var(--bg-subtle);padding:14px;border-radius:8px;" class="mt-2">',
        '      <div class="flex-between mb-1"><span>Nominee</span><strong>{{ vm.order.nominee_name }}</strong></div>',
        '      <div class="flex-between mb-1"><span>Round</span><strong>{{ vm.order.round_name }}</strong></div>',
        '      <div class="flex-between mb-1"><span>Vote Quantity</span><strong>{{ vm.order.vote_quantity }}</strong></div>',
        '      <div class="flex-between"><span>Amount</span><strong>{{ vm.order.amount_major | ghsCurrency:vm.order.currency }}</strong></div>',
        '    </div>',
        '    <div class="inline-actions mt-3">',
        '      <a ng-href="/nominee/{{ vm.order.nominee_slug }}" class="btn btn-primary">Back to {{ vm.order.nominee_name }}</a>',
        '      <a href="/nominees" class="btn btn-secondary">Explore Other Nominees</a>',
        '    </div>',
        '  </div>',
        '</div>'
      ].join(''));
    }]);
})();
