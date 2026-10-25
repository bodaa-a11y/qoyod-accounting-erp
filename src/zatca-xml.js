'use strict';
const crypto = require('crypto');

const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const money = (halalas) => (Number(halalas || 0) / 100).toFixed(2);
const dateOnly = (value) => String(value || '').slice(0, 10);

function tlvBase64(items) {
  const chunks = [];
  for (const [tag, value] of items) {
    const data = Buffer.from(String(value ?? ''), 'utf8');
    chunks.push(Buffer.from([tag, data.length]), data);
  }
  return Buffer.concat(chunks).toString('base64');
}

function buildQrTlv({ seller, vat, timestamp, total, tax }) {
  return tlvBase64([[1, seller], [2, vat], [3, timestamp], [4, total], [5, tax]]);
}

function buildInvoiceXml({ invoice, lines, customer, seller, type = 'simplified' }) {
  if (!invoice || !seller || !customer || !Array.isArray(lines) || !lines.length) {
    throw new Error('بيانات الفاتورة أو البائع أو العميل أو البنود غير مكتملة');
  }
  const uuid = invoice.zatca_uuid || crypto.randomUUID();
  const isSimplified = type === 'simplified';
  const issueDate = dateOnly(invoice.issue_date);
  const issueTime = new Date(invoice.created_at || `${issueDate}T00:00:00Z`).toISOString().slice(11, 19) + 'Z';
  const timestamp = `${issueDate}T${issueTime.replace('Z','')}`;
  const tax = money(invoice.vat_halalas);
  const total = money(invoice.total_halalas);
  const net = money(invoice.subtotal_halalas);
  const qr = buildQrTlv({ seller: seller.seller_name_ar || seller.seller_name_en, vat: seller.vat_number, timestamp, total, tax });
  const lineXml = lines.map((line, i) => {
    const qty = Number(line.qty || 1).toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
    const rate = Number(line.vat_rate || 0).toFixed(2);
    const category = Number(rate) === 0 ? 'Z' : 'S';
    return `<cac:InvoiceLine><cbc:ID>${i + 1}</cbc:ID><cbc:InvoicedQuantity unitCode="PCE">${esc(qty)}</cbc:InvoicedQuantity><cbc:LineExtensionAmount currencyID="SAR">${money(line.subtotal_halalas)}</cbc:LineExtensionAmount><cac:TaxTotal><cbc:TaxAmount currencyID="SAR">${money(line.vat_halalas)}</cbc:TaxAmount><cac:TaxSubtotal><cbc:TaxableAmount currencyID="SAR">${money(line.subtotal_halalas)}</cbc:TaxableAmount><cbc:TaxAmount currencyID="SAR">${money(line.vat_halalas)}</cbc:TaxAmount><cac:TaxCategory><cbc:ID>${category}</cbc:ID><cbc:Percent>${rate}</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory></cac:TaxSubtotal></cac:TaxTotal><cac:Item><cbc:Name>${esc(line.description)}</cbc:Name></cac:Item><cac:Price><cbc:PriceAmount currencyID="SAR">${money(line.unit_price_halalas)}</cbc:PriceAmount></cac:Price></cac:InvoiceLine>`;
  }).join('');
  const customerParty = `<cac:AccountingCustomerParty><cac:Party>${customer.vat_number ? `<cac:PartyTaxScheme><cbc:CompanyID>${esc(customer.vat_number)}</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>` : ''}<cac:PartyLegalEntity><cbc:RegistrationName>${esc(customer.name)}</cbc:RegistrationName></cac:PartyLegalEntity></cac:Party></cac:AccountingCustomerParty>`;
  const sellerParty = `<cac:AccountingSupplierParty><cac:Party><cac:PartyIdentification><cbc:ID schemeID="CRN">${esc(seller.cr_number || '')}</cbc:ID></cac:PartyIdentification><cac:PostalAddress><cbc:StreetName>${esc(seller.street_name || '')}</cbc:StreetName><cbc:BuildingNumber>${esc(seller.building_number || '')}</cbc:BuildingNumber><cac:CitySubdivisionName>${esc(seller.district || '')}</cac:CitySubdivisionName><cbc:CityName>${esc(seller.city || '')}</cbc:CityName><cbc:PostalZone>${esc(seller.postal_code || '')}</cbc:PostalZone><cac:Country><cbc:IdentificationCode>SA</cbc:IdentificationCode></cac:Country></cac:PostalAddress><cac:PartyTaxScheme><cbc:CompanyID>${esc(seller.vat_number || '')}</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme><cac:PartyLegalEntity><cbc:RegistrationName>${esc(seller.seller_name_ar || seller.seller_name_en || '')}</cbc:RegistrationName></cac:PartyLegalEntity></cac:Party></cac:AccountingSupplierParty>`;
  return { uuid, qr, xml: `<?xml version="1.0" encoding="UTF-8"?>\n<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"><cbc:ProfileID>reporting:1.0</cbc:ProfileID><cbc:ID>${esc(invoice.invoice_number)}</cbc:ID><cbc:UUID>${uuid}</cbc:UUID><cbc:IssueDate>${issueDate}</cbc:IssueDate><cbc:IssueTime>${issueTime}</cbc:IssueTime><cbc:InvoiceTypeCode name="${isSimplified ? '0200000' : '0100000'}">${isSimplified ? '388' : '388'}</cbc:InvoiceTypeCode><cbc:DocumentCurrencyCode>SAR</cbc:DocumentCurrencyCode><cbc:TaxCurrencyCode>SAR</cbc:TaxCurrencyCode><cac:AdditionalDocumentReference><cbc:ID>ICV</cbc:ID><cbc:UUID>1</cbc:UUID></cac:AdditionalDocumentReference><cac:AdditionalDocumentReference><cbc:ID>PIH</cbc:ID><cac:Attachment><cbc:EmbeddedDocumentBinaryObject mimeCode="text/plain">${Buffer.from('NWZlY2ViNjZmZmM4NmYzOGQ5NTI3ODZjOTRmOTc2Y2Y=','utf8').toString('utf8')}</cbc:EmbeddedDocumentBinaryObject></cac:Attachment></cac:AdditionalDocumentReference><cac:AdditionalDocumentReference><cbc:ID>QR</cbc:ID><cac:Attachment><cbc:EmbeddedDocumentBinaryObject mimeCode="text/plain">${qr}</cbc:EmbeddedDocumentBinaryObject></cac:Attachment></cac:AdditionalDocumentReference>${sellerParty}${customerParty}<cac:TaxTotal><cbc:TaxAmount currencyID="SAR">${tax}</cbc:TaxAmount><cac:TaxSubtotal><cbc:TaxableAmount currencyID="SAR">${net}</cbc:TaxableAmount><cbc:TaxAmount currencyID="SAR">${tax}</cbc:TaxAmount><cac:TaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>15.00</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory></cac:TaxSubtotal></cac:TaxTotal><cac:LegalMonetaryTotal><cbc:LineExtensionAmount currencyID="SAR">${net}</cbc:LineExtensionAmount><cbc:TaxExclusiveAmount currencyID="SAR">${net}</cbc:TaxExclusiveAmount><cbc:TaxInclusiveAmount currencyID="SAR">${total}</cbc:TaxInclusiveAmount><cbc:PayableAmount currencyID="SAR">${total}</cbc:PayableAmount></cac:LegalMonetaryTotal>${lineXml}</Invoice>` };
}

function sha256Base64(value) { return crypto.createHash('sha256').update(value, 'utf8').digest('base64'); }

module.exports = { buildInvoiceXml, buildQrTlv, sha256Base64 };
