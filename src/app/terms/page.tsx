import React from 'react';

export default function TermsOfService() {
  return (
    <div className="max-w-4xl mx-auto p-8 bg-white min-h-screen">
      <h1 className="text-3xl font-bold mb-6">Terms of Service</h1>
      <p className="mb-4 text-gray-600">Last updated: {new Date().toLocaleDateString()}</p>
      
      <section className="mb-8">
        <h2 className="text-xl font-bold mb-3 text-gray-900">1. Acceptance of Terms</h2>
        <p className="text-gray-700 leading-relaxed">
          By accessing or using our services, you agree to be bound by these Terms. If you do not agree to these Terms, you may not use our services.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-bold mb-3 text-gray-900">2. Use of Services</h2>
        <p className="text-gray-700 leading-relaxed">
          You are responsible for your use of the services and for any content you provide, including compliance with applicable laws, rules, and regulations.
          You may not use our services for any illegal or unauthorized purpose.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-bold mb-3 text-gray-900">3. Payment and Refunds</h2>
        <p className="text-gray-700 leading-relaxed">
          All payments are processed securely. Prices for our services are subject to change without notice.
          Refunds are handled in accordance with our refund policy and applicable laws.
        </p>
      </section>
      
      <section className="mb-8">
        <h2 className="text-xl font-bold mb-3 text-gray-900">4. Limitation of Liability</h2>
        <p className="text-gray-700 leading-relaxed">
          To the maximum extent permitted by law, we shall not be liable for any indirect, incidental, special, consequential or punitive damages, 
          or any loss of profits or revenues, whether incurred directly or indirectly.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-bold mb-3 text-gray-900">5. Changes to Terms</h2>
        <p className="text-gray-700 leading-relaxed">
          We reserve the right to modify these Terms at any time. If we make changes to these Terms, we will provide notice of such changes, 
          such as by sending an email notification, providing notice through our services, or updating the &quot;Last updated&quot; date at the top of these Terms.
        </p>
      </section>
    </div>
  );
}
