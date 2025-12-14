import React from 'react';

export default function PrivacyPolicy() {
  return (
    <div className="max-w-4xl mx-auto p-8 bg-white min-h-screen">
      <h1 className="text-3xl font-bold mb-6">Privacy Policy</h1>
      <p className="mb-4 text-gray-600">Last updated: {new Date().toLocaleDateString()}</p>
      
      <section className="mb-8">
        <h2 className="text-xl font-bold mb-3 text-gray-900">1. Information We Collect</h2>
        <p className="text-gray-700 leading-relaxed">
          We collect information you provide directly to us, such as when you create an account, make a purchase, or communicate with us. 
          This may include your name, email address, payment information, and any other information you choose to provide.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-bold mb-3 text-gray-900">2. How We Use Your Information</h2>
        <p className="text-gray-700 leading-relaxed">
          We use the information we collect to provide, maintain, and improve our services, process transactions, send you related information 
          (including confirmations, invoices, and technical notices), and respond to your comments and questions.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-bold mb-3 text-gray-900">3. Data Security</h2>
        <p className="text-gray-700 leading-relaxed">
          We take reasonable measures to help protect information about you from loss, theft, misuse and unauthorized access, disclosure, alteration, and destruction.
        </p>
      </section>
      
      <section className="mb-8">
        <h2 className="text-xl font-bold mb-3 text-gray-900">4. Third-Party Services</h2>
        <p className="text-gray-700 leading-relaxed">
          We may use third-party services, such as payment processors (e.g., Stripe), who may collect and process your information in accordance with their own privacy policies.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-bold mb-3 text-gray-900">5. Contact Us</h2>
        <p className="text-gray-700 leading-relaxed">
          If you have any questions about this Privacy Policy, please contact us through our support channels.
        </p>
      </section>
    </div>
  );
}
