#!/usr/bin/env node

/**
 * Debug script to test import response structure
 * This will help identify the exact bug in the notification system
 */

const fs = require('fs');
const FormData = require('form-data');
const fetch = require('node-fetch');

async function debugImportResponse() {
  console.log('🔍 Starting debug analysis of import response structure...\n');

  // Read a sample CAMT.053 file (you'll need to provide one)
  const sampleXmlPath = './sample-camt.xml';
  
  // Create a minimal CAMT.053 sample if none exists
  const sampleCamtContent = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02">
  <BkToCstmrStmt>
    <GrpHdr>
      <MsgId>MSG001</MsgId>
      <CreDtTm>2024-01-15T10:00:00</CreDtTm>
    </GrpHdr>
    <Stmt>
      <Id>STMT001</Id>
      <Acct>
        <Id>
          <IBAN>NL91ABNA0417164300</IBAN>
        </Id>
        <Ownr>
          <Nm>Test Account</Nm>
        </Ownr>
      </Acct>
      <Bal>
        <Tp>
          <CdOrPrtry>
            <Cd>CLBD</Cd>
          </CdOrPrtry>
        </Tp>
        <Amt Ccy="EUR">1000.00</Amt>
        <Dt>
          <Dt>2024-01-15</Dt>
        </Dt>
      </Bal>
      <Ntry>
        <Amt Ccy="EUR">-50.00</Amt>
        <CdtDbtInd>DBIT</CdtDbtInd>
        <BookgDt>
          <Dt>2024-01-15</Dt>
        </BookgDt>
        <NtryDtls>
          <TxDtls>
            <Refs>
              <EndToEndId>TXN001</EndToEndId>
            </Refs>
            <RltdPties>
              <Cdtr>
                <Nm>Test Merchant</Nm>
              </Cdtr>
            </RltdPties>
            <RmtInf>
              <Ustrd>Test transaction</Ustrd>
            </RmtInf>
          </TxDtls>
        </NtryDtls>
      </Ntry>
    </Stmt>
  </BkToCstmrStmt>
</Document>`;

  // Write sample file if it doesn't exist
  if (!fs.existsSync(sampleXmlPath)) {
    fs.writeFileSync(sampleXmlPath, sampleCamtContent);
    console.log('📝 Created sample CAMT.053 file for testing');
  }

  try {
    // Test the import endpoint
    const formData = new FormData();
    formData.append('camtFile', fs.createReadStream(sampleXmlPath), {
      filename: 'test-statement.xml',
      contentType: 'application/xml'
    });

    console.log('🚀 Making request to import endpoint...');
    
    const response = await fetch('http://localhost:3000/api/import/1', {
      method: 'POST',
      body: formData,
      headers: {
        'Cookie': 'connect.sid=test-session' // Add session if needed
      }
    });

    console.log(`📊 Response Status: ${response.status} ${response.statusText}`);
    console.log(`📊 Response Headers:`, Object.fromEntries(response.headers.entries()));

    const rawText = await response.text();
    console.log(`📊 Raw Response Text:\n${rawText}\n`);

    try {
      const jsonResponse = JSON.parse(rawText);
      console.log('📊 Parsed JSON Response:');
      console.log(JSON.stringify(jsonResponse, null, 2));

      // Analyze the structure
      console.log('\n🔍 ANALYSIS OF RESPONSE STRUCTURE:');
      console.log('==================================');
      
      // Check if it's wrapped in the middleware response format
      if (jsonResponse.success !== undefined) {
        console.log('✅ Response uses middleware wrapper format');
        console.log(`   - success: ${jsonResponse.success}`);
        console.log(`   - message: ${jsonResponse.message}`);
        console.log(`   - statusCode: ${jsonResponse.statusCode}`);
        console.log(`   - timestamp: ${jsonResponse.timestamp}`);
        
        if (jsonResponse.data) {
          console.log('✅ Data is in jsonResponse.data');
          console.log('   Data structure:');
          console.log(`   - newTransactions: ${jsonResponse.data.newTransactions?.length || 0} items`);
          console.log(`   - newAccounts: ${jsonResponse.data.newAccounts?.length || 0} items`);
          console.log(`   - duplicatesSkipped: ${jsonResponse.data.duplicatesSkipped || 0}`);
          console.log(`   - message: ${jsonResponse.data.message}`);
          console.log(`   - statementId: ${jsonResponse.data.statementId}`);
        } else {
          console.log('❌ No data property found in response');
        }
      } else {
        console.log('❌ Response does NOT use middleware wrapper format');
        console.log('   Direct response structure:');
        console.log(`   - newTransactions: ${jsonResponse.newTransactions?.length || 0} items`);
        console.log(`   - newAccounts: ${jsonResponse.newAccounts?.length || 0} items`);
        console.log(`   - duplicatesSkipped: ${jsonResponse.duplicatesSkipped || 0}`);
        console.log(`   - message: ${jsonResponse.message}`);
      }

      // Analyze the frontend access pattern
      console.log('\n🔍 FRONTEND ACCESS PATTERN ANALYSIS:');
      console.log('===================================');
      console.log('Frontend tries to access: r.data?.newTransactions?.length');
      
      if (jsonResponse.success !== undefined && jsonResponse.data) {
        // Wrapped response
        const accessPath = jsonResponse.data.newTransactions?.length || 0;
        console.log(`✅ r.data.newTransactions.length = ${accessPath}`);
        console.log('   This should work correctly');
      } else {
        // Direct response
        const accessPath = jsonResponse.newTransactions?.length || 0;
        console.log(`❌ r.data.newTransactions.length would be undefined`);
        console.log(`   Direct access r.newTransactions.length = ${accessPath}`);
        console.log('   This explains the bug!');
      }

    } catch (parseError) {
      console.log('❌ Failed to parse response as JSON:', parseError.message);
    }

  } catch (error) {
    console.log('❌ Request failed:', error.message);
    console.log('\nℹ️  Make sure the server is running on http://localhost:3000');
  }

  // Clean up
  if (fs.existsSync(sampleXmlPath)) {
    fs.unlinkSync(sampleXmlPath);
    console.log('\n🧹 Cleaned up sample file');
  }
}

// Run the debug analysis
debugImportResponse().catch(console.error);