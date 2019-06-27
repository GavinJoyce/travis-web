import Controller, { inject as controller } from '@ember/controller';
import { inject as service } from '@ember/service';
import { computed } from '@ember/object';
import { alias } from '@ember/object/computed';
import config from 'travis/config/environment';

export default Controller.extend({
  store: service(),

  config,

  accountController: controller('account'),
  account: alias('accountController.model'),

  plans: alias('model.plans'),

  invoices: computed('model.subscriptions.id', function () {
    const subscriptionId = this.model.subscriptions.id;
    if (subscriptionId) {
      return this.store.query('invoice', { subscription_id: subscriptionId });
    } else {
      return [];
    }
  }),

  isEducation: computed('model', 'account', function () {
    if (!this.model.subscriptions) {
      return !this.model.subscriptions && this.account.education;
    }
  }),

  isTrial: computed('model', 'account', function () {
    if (!this.model.subscriptions) {
      return !this.model.subscriptions && !this.account.education;
    }
  })

  // availablePlans:
  // getPlans() {
  //   this.get('store').findAll('plan').then(function (allPlans) {
  //     return allPlans.filter(plan => plans.includes(plan.name) && plan.build <= 10 && !plan.annual);
  //   });
  // },

});
