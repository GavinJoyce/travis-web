import { module, test } from 'qunit';
import { setupApplicationTest } from 'travis/tests/helpers/setup-application-test';
import profilePage from 'travis/tests/pages/profile';
import signInUser from 'travis/tests/helpers/sign-in-user';
import { selectChoose } from 'ember-power-select/test-support';
import Service from '@ember/service';
import { percySnapshot } from 'ember-percy';
import { stubService } from 'travis/tests/helpers/stub-service';

module('Acceptance | profile/billing', function (hooks) {
  setupApplicationTest(hooks);

  hooks.beforeEach(function () {
    this.user = server.create('user', {
      name: 'User Name of exceeding length',
      type: 'user',
      login: 'user-login',
      github_id: 1974,
      avatar_url: '/images/tiny.gif',
      permissions: {
        createSubscription: true
      }
    });

    signInUser(this.user);

    let plan = server.create('plan', {
      name: 'Small Business Plan',
      builds: 5,
      annual: false,
      currency: 'USD',
      price: 6900
    });
    this.plan = plan;

    server.create('plan', { id: 'travis-ci-one-build', name: 'Bootstrap', builds: 1, price: 6900, currency: 'USD' });
    this.defaultPlan = server.create('plan', { id: 'travis-ci-two-builds', name: 'Startup', builds: 2, price: 12900, currency: 'USD' });
    server.create('plan', { id: 'travis-ci-five-builds', name: 'Premium', builds: 5, price: 24900, currency: 'USD' });
    this.lastPlan = server.create('plan', { id: 'travis-ci-ten-builds', name: 'Small Business', builds: 10, price: 48900, currency: 'USD' });

    server.create('plan', { id: 'travis-ci-one-build-annual', name: 'Bootstrap', builds: 1, price: 75900, currency: 'USD', annual: true });
    this.defaultAnnualPlan = server.create('plan', { id: 'travis-ci-two-builds-annual', name: 'Startup', builds: 2, price: 141900, currency: 'USD', annual: true });
    server.create('plan', { id: 'travis-ci-five-builds-annual', name: 'Premium', builds: 5, price: 273900, currency: 'USD', annual: true });
    server.create('plan', { id: 'travis-ci-ten-builds-annual', name: 'Small Business', builds: 10, price: 537900, currency: 'USD', annual: true });

    let subscription = server.create('subscription', {
      plan,
      owner: this.user,
      status: 'subscribed',
      valid_to: new Date(2018, 5, 19),
      source: 'stripe',
      permissions: {
        write: true
      }
    });
    this.subscription = subscription;

    subscription.createBillingInfo({
      first_name: 'User',
      last_name: 'Name',
      company: 'Travis CI GmbH',
      address: 'Rigaerstraße 8',
      address2: 'Address 2',
      city: 'Berlin',
      state: 'Berlin',
      zip_code: '10987',
      country: 'Germany',
      vat_id: '12345'
    });

    subscription.createCreditCardInfo({
      last_digits: '1919'
    });

    // create organization
    let organization = server.create('organization', {
      name: 'Org Name',
      type: 'organization',
      login: 'org-login',
      permissions: {
        createSubscription: false
      }
    });
    this.organization = organization;

    const createMockCard = () => {
      return {
        createToken: function (data) {
          return new Promise(resolve => {
            resolve({ id: 'stripeToken' });
          });
        }
      };
    };

    let mockStripe = Service.extend({
      load() { },
      card: createMockCard(),
    });

    stubService('stripe', mockStripe);

  });

  test('view billing information with invoices', async function (assert) {
    this.subscription.createInvoice({
      id: '1919',
      created_at: new Date(1919, 4, 15),
      url: 'https://example.com/1919.pdf'
    });

    this.subscription.createInvoice({
      id: '2010',
      created_at: new Date(2010, 1, 14),
      url: 'https://example.com/2010.pdf'
    });

    this.subscription.createInvoice({
      id: '20102',
      created_at: new Date(2010, 2, 14),
      url: 'https://example.com/20102.pdf'
    });

    await profilePage.visit();
    await profilePage.billing.visit();

    percySnapshot(assert);

    assert.equal(profilePage.billing.manageButton.href, 'https://billing.travis-ci.com/subscriptions/user');
    assert.notOk(profilePage.billing.manageButton.isDisabled);
    assert.notOk(profilePage.billing.manageButton.isNew);
    assert.equal(profilePage.billing.manageButton.text, 'Edit subscription');
    assert.ok(profilePage.billing.expiryMessage.isHidden);
    assert.ok(profilePage.billing.marketplaceButton.isHidden);

    assert.equal(profilePage.billing.plan.name, 'Small Business Plan');
    assert.equal(profilePage.billing.plan.concurrency, '5 concurrent jobs');

    assert.equal(profilePage.billing.address.text, 'User Name Travis CI GmbH Rigaerstraße 8 Address 2 Berlin, Berlin 10987 Germany VAT: 12345');
    assert.equal(profilePage.billing.source, 'This plan is paid through Stripe.');
    assert.equal(profilePage.billing.creditCardNumber.text, '•••• •••• •••• 1919');
    assert.equal(profilePage.billing.price.text, '$69 per month');

    assert.ok(profilePage.billing.annualInvitation.isVisible, 'expected the invitation to switch to annual billing to be visible');

    assert.equal(profilePage.billing.invoices.items.length, 2);

    profilePage.billing.invoices.items[1].as(i1919 => {
      assert.equal(i1919.href, 'https://example.com/2010.pdf');
    });

    // Write more test cases.
    // assert.equal(profilePage.billing.invoices.items[0].text, '20102 February 20102');
  });

  test('view billing on an expired stripe plan', async function (assert) {
    this.subscription.status = 'expired';

    await profilePage.visit();
    await profilePage.billing.visit();

    assert.equal(profilePage.billing.expiryMessage.text, 'You had a Stripe subscription that expired on June 19, 2018.');
    assert.equal(profilePage.billing.manageButton.text, 'Resubscribe');
    assert.equal(profilePage.billing.manageButton.href, 'https://billing.travis-ci.com/subscriptions/user');

    assert.ok(profilePage.billing.marketplaceButton.isHidden);
    assert.ok(profilePage.billing.address.isHidden);
    assert.ok(profilePage.billing.creditCardNumber.isHidden);
    assert.ok(profilePage.billing.annualInvitation.isHidden);
  });

  test('view billing on a canceled stripe plan', async function (assert) {
    this.subscription.status = 'canceled';

    await profilePage.visit();
    await profilePage.billing.visit();

    assert.equal(profilePage.billing.expiryMessage.text, 'This subscription has been canceled by you and is valid through June 19, 2018.');
    assert.equal(profilePage.billing.manageButton.href, 'https://billing.travis-ci.com/subscriptions/user');
    assert.equal(profilePage.billing.manageButton.text, 'Resubscribe');

    assert.ok(profilePage.billing.marketplaceButton.isHidden);
    assert.ok(profilePage.billing.address.isHidden);
    assert.ok(profilePage.billing.creditCardNumber.isHidden);
    assert.ok(profilePage.billing.annualInvitation.isHidden);
  });

  test('view billing on a manual plan with no invoices', async function (assert) {
    this.subscription.source = 'manual';
    this.subscription.status = undefined;
    this.subscription.valid_to = new Date(2025, 7, 16).toISOString();

    await profilePage.visit();
    await profilePage.billing.visit();

    assert.ok(profilePage.billing.manageButton.isHidden);
    assert.ok(profilePage.billing.address.isHidden);
    assert.ok(profilePage.billing.creditCardNumber.isHidden);
    assert.ok(profilePage.billing.price.isHidden);
    assert.equal(profilePage.billing.source, 'This is a manual subscription.');
    assert.ok(profilePage.billing.annualInvitation.isHidden);

    assert.ok(profilePage.billing.invoices.isHidden);
  });

  test('view billing on an expired manual plan', async function (assert) {
    this.subscription.source = 'manual';
    this.subscription.status = undefined;
    this.subscription.valid_to = new Date(2018, 6, 16).toISOString();

    await profilePage.visit();
    await profilePage.billing.visit();

    assert.ok(profilePage.billing.manageButton.isHidden);
    assert.ok(profilePage.billing.address.isHidden);
    assert.ok(profilePage.billing.creditCardNumber.isHidden);
    assert.ok(profilePage.billing.price.isHidden);
    assert.ok(profilePage.billing.annualInvitation.isHidden);
    assert.ok(profilePage.billing.invoices.isHidden);
    assert.equal(profilePage.billing.expiryMessage.text, 'You had a manual subscription that expired on July 16, 2018. If you have any questions or would like to update your plan, please contact our support team.');
  });

  test('view billing on a marketplace plan', async function (assert) {
    this.subscription.source = 'github';

    await profilePage.visit();
    await profilePage.billing.visit();

    assert.equal(profilePage.billing.manageButton.href, 'https://github.com/marketplace/travis-ci/');

    assert.ok(profilePage.billing.address.isHidden);
    assert.ok(profilePage.billing.creditCardNumber.isHidden);
    assert.equal(profilePage.billing.source, 'This subscription is managed by GitHub Marketplace.');
    assert.ok(profilePage.billing.annualInvitation.isHidden);
  });

  test('view billing on an canceled marketplace plan', async function (assert) {
    this.subscription.source = 'github';
    this.subscription.status = 'canceled';

    await profilePage.visit();
    await profilePage.billing.visit();

    assert.equal(profilePage.billing.expiryMessage.text, 'This subscription has been canceled by you and is valid through June 19, 2018.');
    assert.equal(profilePage.billing.marketplaceButton.text, 'Continue with GitHub Marketplace');
    assert.equal(profilePage.billing.marketplaceButton.href, 'https://github.com/marketplace/travis-ci/');
    assert.equal(profilePage.billing.manageButton.text, 'New subscription');
    assert.equal(profilePage.billing.manageButton.href, 'https://billing.travis-ci.com/subscriptions/new?id=user');

    assert.ok(profilePage.billing.address.isHidden);
    assert.ok(profilePage.billing.creditCardNumber.isHidden);
    assert.ok(profilePage.billing.annualInvitation.isHidden);
  });

  test('view billing on an expired marketplace plan', async function (assert) {
    this.subscription.source = 'github';
    this.subscription.status = 'expired';

    await profilePage.visit();
    await profilePage.billing.visit();

    assert.equal(profilePage.billing.expiryMessage.text, 'You had a GitHub Marketplace subscription that expired on June 19, 2018.');
    assert.equal(profilePage.billing.marketplaceButton.text, 'Continue with GitHub Marketplace');
    assert.equal(profilePage.billing.marketplaceButton.href, 'https://github.com/marketplace/travis-ci/');
    assert.equal(profilePage.billing.manageButton.text, 'New subscription');
    assert.equal(profilePage.billing.manageButton.href, 'https://billing.travis-ci.com/subscriptions/new?id=user');

    assert.ok(profilePage.billing.address.isHidden);
    assert.ok(profilePage.billing.creditCardNumber.isHidden);
    assert.ok(profilePage.billing.annualInvitation.isHidden);
  });

  test('view billing on an annual plan', async function (assert) {
    this.plan.annual = true;
    this.plan.price = 10000;

    await profilePage.visit();
    await profilePage.billing.visit();

    assert.equal(profilePage.billing.price.text, '$100 per year');
    assert.ok(profilePage.billing.annualInvitation.isHidden, 'expected the invitation to switch to annual billing to be hidden');
  });

  test('view billing tab when not subscribed and has subscription write permissions', async function (assert) {
    this.subscription.destroy();

    await profilePage.visit();
    await profilePage.billing.visit();

    assert.ok(profilePage.billing.billingForm.isPresent);
    assert.ok(profilePage.billing.billingPlanChoices.isPresent);

    assert.ok(profilePage.billing.selectedBillingPlan.isPresent);
    assert.dom(profilePage.billing.selectedBillingPlan.name.scope).hasTextContaining(`${this.defaultPlan.name} plan`);
    assert.dom(profilePage.billing.selectedBillingPlan.jobs.scope).hasTextContaining(`${this.defaultPlan.builds} concurrent jobs`);
    assert.dom(profilePage.billing.selectedBillingPlan.freeJobs.scope).hasTextContaining('3 free concurrent jobs');
    assert.dom(profilePage.billing.selectedBillingPlan.price.scope).hasTextContaining(`$${this.defaultPlan.price / 100} /month`);

    assert.dom(profilePage.billing.billingForm.input.scope).exists({ count: 9 });
    assert.dom(profilePage.billing.billingForm.select.scope).exists({ count: 1 });
    assert.dom(profilePage.billing.billingPlanChoices.boxes.scope).exists({ count: 4 });
    assert.equal(profilePage.billing.subscribeButton.text, 'Proceed to Payment');
  });

  test('view billing tab when switch is clicked on plan changes correctly', async function (assert) {
    this.subscription.destroy();

    await profilePage.visit();
    await profilePage.billing.visit();
    await profilePage.billing.billingForm.switchPlan.click();

    assert.dom(profilePage.billing.selectedBillingPlan.name.scope).hasTextContaining(`${this.defaultAnnualPlan.name} plan`);
    assert.dom(profilePage.billing.selectedBillingPlan.jobs.scope).hasTextContaining(`${this.defaultAnnualPlan.builds} concurrent jobs`);
    assert.dom(profilePage.billing.selectedBillingPlan.freeJobs.scope).hasTextContaining('3 free concurrent jobs');
    assert.dom(profilePage.billing.selectedBillingPlan.price.scope).hasTextContaining(`$${this.defaultAnnualPlan.price / 100} /year`);

    await profilePage.billing.billingForm.switchPlan.click();

    assert.dom(profilePage.billing.selectedBillingPlan.name.scope).hasTextContaining(`${this.defaultPlan.name} plan`);
    assert.dom(profilePage.billing.selectedBillingPlan.jobs.scope).hasTextContaining(`${this.defaultPlan.builds} concurrent jobs`);
    assert.dom(profilePage.billing.selectedBillingPlan.freeJobs.scope).hasTextContaining('3 free concurrent jobs');
    assert.dom(profilePage.billing.selectedBillingPlan.price.scope).hasTextContaining(`$${this.defaultPlan.price / 100} /month`);
  });

  test('view billing tab when not subscribed select different plan changes correctly', async function (assert) {
    this.subscription.destroy();

    await profilePage.visit();
    await profilePage.billing.visit();
    await profilePage.billing.billingPlanChoices.lastBox.visit();

    assert.dom(profilePage.billing.selectedBillingPlan.name.scope).hasTextContaining(`${this.lastPlan.name} plan`);
    assert.dom(profilePage.billing.selectedBillingPlan.jobs.scope).hasTextContaining(`${this.lastPlan.builds} concurrent jobs`);
    assert.dom(profilePage.billing.selectedBillingPlan.freeJobs.scope).hasTextContaining('3 free concurrent jobs');
    assert.dom(profilePage.billing.selectedBillingPlan.price.scope).hasTextContaining(`$${this.lastPlan.price / 100} /month`);
  });

  test('view billing tab when subscribed and no subscription write permissions', async function (assert) {
    this.subscription.permissions.write = false;
    this.subscription.save();

    await profilePage.visit();
    await profilePage.billing.visit();

    assert.ok(profilePage.billing.annualInvitation.isHidden);
    assert.ok(profilePage.billing.manageButton.isDisabled, 'expected disabled subscription management button when lacking permissions');
  });

  test('view billing tab when there is no subscription and no write permissions', async function (assert) {
    this.subscription.destroy();
    this.user.permissions.createSubscription = false;

    await profilePage.visit();
    await profilePage.billing.visit();

    percySnapshot(assert);

    assert.ok(profilePage.billing.expiryMessage.isHidden);
    assert.equal(profilePage.billing.noPermissionMessage.text, 'You do not have permission to create a subscription');
  });

  test('switching to another account’s billing tab loads the subscription form properly', async function (assert) {
    this.organization.permissions = {
      createSubscription: true
    };
    this.organization.save();

    await profilePage.visit();
    await profilePage.billing.visit();
    await profilePage.accounts[1].visit();
    await profilePage.billing.visit();

    percySnapshot(assert);

    assert.ok(profilePage.billing.billingForm.isPresent);
    assert.ok(profilePage.billing.billingPlanChoices.isPresent);

    assert.ok(profilePage.billing.selectedBillingPlan.isPresent);
    assert.dom(profilePage.billing.selectedBillingPlan.name.scope).hasTextContaining(`${this.defaultPlan.name} plan`);
    assert.dom(profilePage.billing.selectedBillingPlan.jobs.scope).hasTextContaining(`${this.defaultPlan.builds} concurrent jobs`);
    assert.dom(profilePage.billing.selectedBillingPlan.freeJobs.scope).hasTextContaining('3 free concurrent jobs');
    assert.dom(profilePage.billing.selectedBillingPlan.price.scope).hasTextContaining(`$${this.defaultPlan.price / 100} /month`);

    assert.dom(profilePage.billing.billingForm.input.scope).exists({ count: 9 });
    assert.dom(profilePage.billing.billingForm.select.scope).exists({ count: 1 });
    assert.dom(profilePage.billing.billingPlanChoices.boxes.scope).exists({ count: 4 });
    assert.equal(profilePage.billing.subscribeButton.text, 'Proceed to Payment');
  });

  test('view billing tab when trial has not started', async function (assert) {
    this.organization.permissions = {
      createSubscription: true
    };
    this.organization.save();

    await profilePage.visitOrganization({ name: 'org-login' });
    await profilePage.billing.visit();

    percySnapshot(assert);
    assert.equal(profilePage.billing.trial.name, 'Your trial includes 100 trial builds and 2-concurrent-jobs, no credit card required. Need help? Check our getting started guide.');
    assert.equal(profilePage.billing.subscribeButton.text, 'Proceed to Payment');
  });

  test('view billing tab with no create subscription permissions', async function (assert) {
    this.organization.permissions = {
      createSubscription: false
    };
    this.organization.save();

    await profilePage.visitOrganization({ name: 'org-login' });
    await profilePage.billing.visit();

    assert.equal(profilePage.billing.trial.name, 'Your trial includes 100 trial builds and 2-concurrent-jobs, no credit card required. Need help? Check our getting started guide.');
    assert.equal(profilePage.billing.noPermissionMessage.text, 'You do not have permission to create a subscription');
  });

  test('view billing tab when there is a new trial', async function (assert) {
    this.subscription = null;
    this.organization.permissions = {
      createSubscription: true
    };
    this.organization.save();
    let trial = server.create('trial', {
      builds_remaining: 100,
      owner: this.organization,
      status: 'new',
      created_at: new Date(2018, 7, 16),
      permissions: {
        read: true,
        write: true
      }
    });

    this.trial = trial;
    this.trial.save();

    await profilePage.visitOrganization({ name: 'org-login' });
    await profilePage.billing.visit();

    assert.equal(profilePage.billing.trial.name, "You've got 100 trial builds left. Ensure unlimited builds by setting up a plan before it runs out!");
    assert.equal(profilePage.billing.subscribeButton.text, 'Proceed to Payment');
  });

  test('view billing tab when trial has started', async function (assert) {
    this.subscription = null;
    this.organization.permissions = {
      createSubscription: true
    };
    this.organization.save();
    let trial = server.create('trial', {
      builds_remaining: 25,
      owner: this.organization,
      status: 'started',
      created_at: new Date(2018, 7, 16),
      permissions: {
        read: true,
        write: true
      }
    });
    this.trial = trial;
    this.trial.save();

    await profilePage.visitOrganization({ name: 'org-login' });
    await profilePage.billing.visit();

    percySnapshot(assert);
    assert.equal(profilePage.billing.trial.name, "You've got 25 trial builds left. Ensure unlimited builds by setting up a plan before it runs out!");
    assert.equal(profilePage.billing.subscribeButton.text, 'Proceed to Payment');
  });

  test('view billing tab when trial has ended', async function (assert) {
    this.subscription = null;
    this.organization.permissions = {
      createSubscription: true
    };
    this.organization.save();
    let trial = server.create('trial', {
      builds_remaining: 0,
      owner: this.organization,
      status: 'ended',
      created_at: new Date(2018, 7, 16),
      permissions: {
        read: true,
        write: true
      }
    });
    this.trial = trial;
    this.trial.save();

    await profilePage.visitOrganization({ name: 'org-login' });
    await profilePage.billing.visit();

    assert.equal(profilePage.billing.trial.name, 'Your trial has just ended. To get the most out of Travis CI, set up a plan below!');
    assert.equal(profilePage.billing.subscribeButton.text, 'Proceed to Payment');
  });

  test('view billing tab with Github trial subscription', async function (assert) {
    let trial = server.create('trial', {
      builds_remaining: 0,
      owner: this.organization,
      status: 'started',
      created_at: new Date(2018, 7, 16),
      permissions: {
        read: true,
        write: true
      }
    });

    this.subscription.owner = this.organization;
    this.subscription.source = 'github';

    trial.save();
    this.subscription.save();

    await profilePage.visitOrganization({ name: 'org-login' });
    await profilePage.billing.visit();

    percySnapshot(assert);
    assert.equal(profilePage.billing.trial.name, "You're trialing Travis CI via your Github Marketplace subscription.");
    assert.equal(profilePage.billing.manageButton.text, 'Edit subscription');
    assert.ok(profilePage.billing.address.isHidden);
    assert.ok(profilePage.billing.creditCardNumber.isHidden);
    assert.equal(profilePage.billing.source, 'This subscription is managed by GitHub Marketplace.');
    assert.ok(profilePage.billing.annualInvitation.isHidden);
  });

  test('view billing tab with Github trial subscription has ended', async function (assert) {
    let trial = server.create('trial', {
      builds_remaining: 0,
      owner: this.organization,
      status: 'ended',
      created_at: new Date(2018, 7, 16),
      permissions: {
        read: true,
        write: true
      }
    });

    this.subscription.owner = this.organization;
    this.subscription.source = 'github';

    trial.save();
    this.subscription.save();

    await profilePage.visitOrganization({ name: 'org-login' });
    await profilePage.billing.visit();

    assert.equal(profilePage.billing.manageButton.text, 'Edit subscription');
    assert.ok(profilePage.billing.address.isHidden);
    assert.ok(profilePage.billing.creditCardNumber.isHidden);
    assert.equal(profilePage.billing.source, 'This subscription is managed by GitHub Marketplace.');
    assert.ok(profilePage.billing.annualInvitation.isHidden);
  });

  test('view billing tab on education account', async function (assert) {
    this.subscription = null;
    this.organization.attrs.education = true;
    this.organization.permissions = { createSubscription: true };
    this.organization.save();

    await profilePage.visitOrganization({ name: 'org-login' });
    await profilePage.billing.visit();

    percySnapshot(assert);
    assert.equal(profilePage.billing.education.name, 'This is an educational account and includes a single build plan. Need help? Check our getting started guide');
    assert.equal(profilePage.billing.manageButton.text, 'New subscription');
  });

  test('logs an exception when there is a subscription without a plan and handles unknowns', async function (assert) {
    let async = assert.async();

    this.subscription.plan = null;
    this.subscription.save();

    let mockSentry = Service.extend({
      logException(error) {
        assert.equal(error.message, 'User user-login has a subscription with no plan!');
        async();
      },
    });

    stubService('raven', mockSentry);

    await profilePage.visit();
    await profilePage.billing.visit();

    assert.equal(profilePage.billing.plan.name, 'Unknown plan');
    assert.equal(profilePage.billing.plan.concurrency, 'Unknown concurrent jobs');
    assert.ok(profilePage.billing.price.isHidden);
    assert.ok(profilePage.billing.annualInvitation.isHidden);
  });

  test('view billing tab when no subscription should fill form and transition to payment', async function (assert) {
    this.subscription.destroy();

    await profilePage.visit();
    await profilePage.billing.visit();

    const { billingForm, subscribeButton, billingPaymentForm } = profilePage.billing;

    percySnapshot(assert);

    await selectChoose(billingForm.billingSelectCountry.scope, 'Germany');

    await billingForm
      .fillIn('firstname', 'John')
      .fillIn('lastname', 'Doe')
      .fillIn('companyName', 'Travis')
      .fillIn('email', 'john@doe.com')
      .fillIn('address', '15 Olalubi street')
      .fillIn('suite', '23 Grace')
      .fillIn('city', 'Berlin')
      .fillIn('zip', '353564')
      .fillIn('vat', '356463');

    await subscribeButton.click();

    assert.ok(billingPaymentForm.isPresent);
    assert.dom(billingPaymentForm.input.scope).exists({ count: 4 });
    assert.ok(billingPaymentForm.completeButton.isPresent);
    assert.ok(billingPaymentForm.cardMonthSelect.isPresent);
    assert.ok(billingPaymentForm.cardYearSelect.isPresent);

    let year = new Date().getFullYear() + 3;
    await selectChoose('.billing-card-year', `${year}`);
    await selectChoose('.billing-card-month', '09');

    await billingPaymentForm
      .fillIn('cardNumber', '4141414141414141')
      .fillIn('cardName', 'John Doe')
      .fillIn('cardCvc', '897')
      .fillIn('discountCode', '0000');

    await billingPaymentForm.completeButton.click();

    assert.dom('[data-test-pending-message]')
      .containsText('This subscription is pending verification from Stripe, and should be approved in a few minutes.');
  });
});
