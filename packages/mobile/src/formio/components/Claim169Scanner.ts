/*
 * Licensed to the Association pour la cooperation numerique (ACN) under one
 * or more contributor license agreements. See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership. The ACN licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License. You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import Formio from 'formiojs';
import { Claim169ScannerService } from '../../services/Claim169ScannerService';
import { registerIssuerKey, Claim169IdentityData, VerifiedIdentity, genderToString, imageFormatToMimeType } from '../../services/claim169Service';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Field = (Formio as { Components: { components: { field: unknown } } }).Components.components.field as any;

interface FieldMapping {
  claimField: string;
  formField: string;
  overwrite: boolean;
}

interface TrustedIssuerConfig {
  issuerId: string;
  // Flattened keys (new format)
  ed25519Key?: string;
  es256Key?: string;
  // Nested keys (legacy format)
  publicKey?: {
    ed25519?: string;
    es256?: string;
  };
}

export default class Claim169Scanner extends Field {
  static schema(...extend: unknown[]) {
    return Field.schema({
      type: 'claim169Scanner',
      label: 'Scan Identity',
      key: 'claim169Scanner',
      inputType: 'hidden',
      protected: false,
      unique: false,
      persistent: true,
      // Custom properties
      trustedIssuers: [],
      fieldMappings: [],
      storeOriginalData: true,
      validate: {
        required: false
      }
    }, ...extend);
  }

  static get builderInfo() {
    return {
      title: 'Claim-169 Scanner',
      group: 'advanced',
      icon: 'qrcode',
      weight: 0,
      documentation: '#',
      schema: Claim169Scanner.schema()
    };
  }

  get defaultSchema() {
    return Claim169Scanner.schema();
  }

  constructor(component: unknown, options: unknown, data: unknown) {
    super(component, options, data);
    this.isScanning = false;
  }

  elementInfo() {
    const info = super.elementInfo();
    info.type = 'div';
    info.attr.class += ' claim169-scanner-container';
    return info;
  }

  escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(text));
    return div.innerHTML;
  }

  render(_content: string) {
    const value = this.dataValue || this.getValue();
    const isCaptured = value && value.identity;
    const label = this.escapeHtml(this.component.label || 'Scan Identity');

    return super.render(`
      <div class="card card-body bg-light">
        <div class="d-flex align-items-center justify-content-between">
          <div>
            <div class="fw-bold mb-1">${label}</div>
            <div class="text-muted small">
              ${isCaptured ? 'Identity scanned and verified' : 'Scan a Claim-169 QR code'}
            </div>
          </div>
          <button class="btn ${isCaptured ? 'btn-success' : 'btn-primary'}" ref="scanButton">
            <i class="fa ${isCaptured ? 'fa-check' : 'fa-qrcode'} me-2"></i>
            ${isCaptured ? 'Rescan' : 'Scan'}
          </button>
        </div>
        ${isCaptured ? `
          <div class="mt-3 pt-3 border-top">
            <div class="d-flex align-items-center">
              ${this.renderPhoto(value)}
              <div class="ms-3">
                <div class="fw-bold">${this.escapeHtml(value.identity.fullName || 'Unknown Name')}</div>
                <div class="text-muted small text-truncate" style="max-width: 200px;">
                  ID: ${this.escapeHtml(value.identity.id || 'N/A')}
                </div>
                ${value.isVerified ? '<span class="badge bg-success">Verified</span>' : '<span class="badge bg-warning text-dark">Unverified</span>'}
                ${value.isExpired ? '<span class="badge bg-danger">Expired</span>' : ''}
              </div>
            </div>
          </div>
        ` : ''}
      </div>
    `);
  }

  renderPhoto(value: VerifiedIdentity) {
    if (value.identity && value.identity.photo && value.identity.photo.length > 0) {
      // Photo is Uint8Array (or array if deserialized from JSON), need to convert to base64
      let base64 = '';
      const photo = value.identity.photo;
      
      // Handle both Uint8Array and regular array (from JSON)
      const bytes = photo instanceof Uint8Array ? photo : new Uint8Array(Object.values(photo));
      
      for (let i = 0; i < bytes.length; i++) {
        base64 += String.fromCharCode(bytes[i]);
      }
      const b64 = btoa(base64);
      const mimeType = imageFormatToMimeType(value.identity.photoFormat);
      
      return `<img src="data:${mimeType};base64,${b64}" class="rounded-circle" style="width: 48px; height: 48px; object-fit: cover;" alt="Identity Photo">`;
    }
    return '<div class="rounded-circle bg-secondary d-flex align-items-center justify-content-center text-white" style="width: 48px; height: 48px;"><i class="fa fa-user"></i></div>';
  }

  attach(element: HTMLElement) {
    const refs = super.attach(element);
    this.loadRefs(element, { scanButton: 'single' });
    this.addEventListener(this.refs.scanButton, 'click', (event: Event) => {
      event.preventDefault();
      this.startScan();
    });
    return refs;
  }

  async startScan() {
    // Build trusted issuers list from component configuration
    const trustedIssuers: Array<{ issuerId: string; ed25519Key?: string; es256Key?: string }> = [];

    if (this.component.trustedIssuers && Array.isArray(this.component.trustedIssuers)) {
      this.component.trustedIssuers.forEach((issuer: TrustedIssuerConfig) => {
        if (issuer.issuerId) {
          // Support both flattened keys (new format) and nested publicKey (legacy format)
          const ed25519Key = issuer.ed25519Key || issuer.publicKey?.ed25519;
          const es256Key = issuer.es256Key || issuer.publicKey?.es256;

          trustedIssuers.push({
            issuerId: issuer.issuerId,
            ed25519Key,
            es256Key
          });

          registerIssuerKey(issuer.issuerId, { ed25519: ed25519Key, es256: es256Key });
        }
      });
    }

    try {
      const result = await Claim169ScannerService.scan({
        title: this.component.label,
        description: this.component.description || 'Scan Claim-169 QR Code',
        trustedIssuers
      });

      if (result) {
        this.handleScanResult(result);
      }
    } catch (error) {
      this.emit('error', error);
    }
  }

  handleScanResult(result: VerifiedIdentity) {
    // 1. Map fields to form components
    if (this.component.fieldMappings && Array.isArray(this.component.fieldMappings)) {
      this.component.fieldMappings.forEach((mapping: FieldMapping) => {
        if (mapping.claimField && mapping.formField) {
          const value = this.getClaimValue(result.identity, mapping.claimField);
          if (value !== undefined) {
            const component = this.root.getComponent(mapping.formField);
            if (component) {
              if (mapping.overwrite || !component.getValue()) {
                component.setValue(value);
              }
            }
          }
        }
      });
    }

    // 2. Store original data if configured
    if (this.component.storeOriginalData) {
      this.setValue(result);
    } else {
      // If not storing original data, we just store minimal status metadata
      this.setValue({
        isVerified: result.isVerified,
        isExpired: result.isExpired,
        cwt: result.cwt,
        // We might want to store minimal identity info for display if needed, 
        // but if storeOriginalData is false, user usually wants to avoid storing PII in this field
        identity: {
          id: result.identity.id,
          fullName: result.identity.fullName // Minimal display info
        }
      });
    }
    
    this.redraw();
  }

  getClaimValue(identity: Claim169IdentityData, fieldPath: string): unknown {
    const parts = fieldPath.split('.');
    let current: any = identity; // eslint-disable-line @typescript-eslint/no-explicit-any
    
    for (const part of parts) {
      if (current === undefined || current === null) return undefined;
      current = current[part];
    }
    
    // Special handling for specific fields to match Form.io expected formats
    if (fieldPath === 'gender') {
        return genderToString(current as number);
    }
    
    if (fieldPath === 'dateOfBirth') {
        return current as string;
    }

    if (fieldPath === 'photo' && current) {
         const mimeType = imageFormatToMimeType(identity.photoFormat);
         // Convert Uint8Array to base64 for image components
         let base64 = '';
         const bytes = current instanceof Uint8Array ? current : new Uint8Array(Object.values(current as object));
         for (let i = 0; i < bytes.length; i++) {
            base64 += String.fromCharCode(bytes[i]);
         }
         // Many Form.io image components expect base64 string directly or data URI
         const b64 = btoa(base64);
         return `data:${mimeType};base64,${b64}`;
    }

    return current;
  }
}
