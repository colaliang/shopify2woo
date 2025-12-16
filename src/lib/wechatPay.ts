import crypto from 'crypto';
import { parseStringPromise, Builder } from 'xml2js';

// WeChat Pay API Constants
const WXPAY_DOMAIN = 'https://api.mch.weixin.qq.com';

interface WeChatPayConfig {
    appId: string;
    mchId: string;
    apiKey: string;
    notifyUrl?: string;
    certP12?: Buffer | string; // For refunds
}

export class WeChatPay {
    private config: WeChatPayConfig;

    constructor(config: WeChatPayConfig) {
        this.config = config;
    }

    // --- Core Utilities ---

    /**
     * Generate MD5 Signature
     * 1. Sort params by ASCII key
     * 2. Append &key=API_KEY
     * 3. MD5 and uppercase
     */
    private sign(params: Record<string, any>): string {
        const sortedKeys = Object.keys(params).sort();
        const kvPairs: string[] = [];

        for (const key of sortedKeys) {
            const value = params[key];
            if (value !== null && value !== undefined && value !== '' && key !== 'sign') {
                kvPairs.push(`${key}=${value}`);
            }
        }

        const stringA = kvPairs.join('&');
        const stringSignTemp = `${stringA}&key=${this.config.apiKey}`;
        
        return crypto.createHash('md5').update(stringSignTemp).digest('hex').toUpperCase();
    }

    /**
     * Build XML from Object
     */
    private buildXml(obj: Record<string, any>): string {
        const builder = new Builder({
            rootName: 'xml',
            cdata: true,
            headless: true
        });
        return builder.buildObject(obj);
    }

    /**
     * Parse XML to Object
     */
    private async parseXml(xml: string): Promise<Record<string, any>> {
        const result = await parseStringPromise(xml, {
            explicitArray: false,
            ignoreAttrs: true
        });
        return result.xml || result;
    }

    /**
     * Validate Signature from response/callback
     */
    public checkSignature(data: Record<string, any>): boolean {
        if (!data.sign) return false;
        const targetSign = data.sign;
        const calcSign = this.sign(data);
        return calcSign === targetSign;
    }

    /**
     * Generate Random Nonce String
     */
    private generateNonceStr(length = 32): string {
        return crypto.randomBytes(Math.ceil(length / 2)).toString('hex').slice(0, length).toUpperCase();
    }

    /**
     * Base Request Handler
     */
    private async request(endpoint: string, params: Record<string, any>, useCert = false): Promise<any> {
        // 1. Add common params
        const payload: Record<string, any> = {
            appid: this.config.appId,
            mch_id: this.config.mchId,
            nonce_str: this.generateNonceStr(),
            ...params
        };

        // 2. Sign
        payload.sign = this.sign(payload);

        // 3. To XML
        const xml = this.buildXml(payload);

        // 4. Send Request
        const options: RequestInit = {
            method: 'POST',
            body: xml,
            headers: {
                'Content-Type': 'application/xml'
            }
        };

        // Note: Node.js fetch might not support certs directly in standard fetch (Next.js/Edge).
        // For refunds (useCert=true), we usually need 'https' agent or similar.
        // In Next.js Edge Runtime, client certs are tricky.
        // Assuming we run this in Nodejs runtime.
        if (useCert && this.config.certP12) {
             // In a real Node environment we would use https.Agent with pfx.
             // But fetch in Next.js extends global fetch.
             // We might need to use 'https' module directly for cert requests if fetch doesn't support it easily.
             // For this implementation, we'll try standard fetch, but warn about certs.
             // TODO: Implement https.Agent for certs if running in Node.
             // See 'https' module usage below for refunds.
             const https = require('https');
             const agent = new https.Agent({
                 pfx: this.config.certP12,
                 passphrase: this.config.mchId // Default passphrase is usually mch_id
             });
             // @ts-ignore
             options.agent = agent; 
        }

        const res = await fetch(`${WXPAY_DOMAIN}${endpoint}`, options);
        const resXml = await res.text();
        const resData = await this.parseXml(resXml);

        // 5. Check Return Code
        if (resData.return_code !== 'SUCCESS') {
             throw new Error(`WeChat Pay Error: ${resData.return_msg}`);
        }

        // 6. Verify Signature (Optional but recommended, though WeChat sometimes omits sign on errors)
        if (resData.result_code === 'SUCCESS' && resData.sign) {
             if (!this.checkSignature(resData)) {
                 console.warn('WeChat Pay Response Signature Verification Failed', resData);
             }
        }

        return resData;
    }

    // --- APIs ---

    /**
     * Unified Order (统一下单)
     */
    public async unifiedOrder(params: {
        body: string;
        out_trade_no: string;
        total_fee: number; // in cents
        spbill_create_ip: string;
        notify_url?: string;
        trade_type?: 'NATIVE' | 'JSAPI' | 'APP' | 'MWEB';
        openid?: string; // Required for JSAPI
        product_id?: string; // Required for NATIVE
    }) {
        const data = {
            trade_type: 'NATIVE', // Default
            notify_url: this.config.notifyUrl,
            ...params
        };
        return this.request('/pay/unifiedorder', data);
    }

    /**
     * Order Query (查询订单)
     */
    public async orderQuery(params: { transaction_id?: string; out_trade_no?: string }) {
        if (!params.transaction_id && !params.out_trade_no) {
            throw new Error('Either transaction_id or out_trade_no is required');
        }
        return this.request('/pay/orderquery', params);
    }

    /**
     * Close Order (关闭订单)
     */
    public async closeOrder(out_trade_no: string) {
        return this.request('/pay/closeorder', { out_trade_no });
    }

    /**
     * Refund (退款) - Requires Cert
     */
    public async refund(params: {
        out_refund_no: string;
        total_fee: number;
        refund_fee: number;
        transaction_id?: string;
        out_trade_no?: string;
        notify_url?: string;
    }) {
        if (!params.transaction_id && !params.out_trade_no) {
            throw new Error('Either transaction_id or out_trade_no is required');
        }
        return this.request('/secapi/pay/refund', params, true);
    }

    /**
     * Refund Query (退款查询)
     */
    public async refundQuery(params: {
        refund_id?: string;
        out_refund_no?: string;
        transaction_id?: string;
        out_trade_no?: string;
    }) {
        return this.request('/pay/refundquery', params);
    }
}
