/*
@rootVar: EC_ASR_BUTTON
@name: Experiment Automatic Sample Reduction (ASR) Button
@version: 1.0.0
@description: Adds an ASR button into the Experiment toolbar
@requiredElabVersion: 2.35.0
@author: Extracellular
*/

/*!
 * © 2025 Extracellular — released under the MIT License
 * See LICENSE file for details.
*/

/*
  unitShort - quantityType - calculationFactor
  L - Volume - 1
  ml - Volume - 0.001
  µl - Volume - 0.000001
  kg - Mass - 1000
  g - Mass - 1
  mg - Mass - 0.001
  µg - Mass - 0.000001
  pcs - Number - 1

*/

var EC_ASR_BUTTON = {};


(function (context) {
  
  const UNIT_DEFINITIONS = {
    // Volume type (base unit in litres (L))
    'l': {quantityType: 'Volume', calculationFactor: 1},
    'ml': {quantityType: 'Volume', calculationFactor: 0.001},
    'µl': {quantityType: 'Volume', calculationFactor: 0.000001},
    // Mass type (base unit in grams (g))
    'kg': {quantityType: 'Mass', calculationFactor: 1000},
    'g': {quantityType: 'Mass', calculationFactor: 1},
    'mg': {quantityType: 'Mass', calculationFactor: 0.001},
    'µg': {quantityType: 'Mass', calculationFactor: 0.000001},
    // Number type (base unit is pieces (pcs))
    'pcs': {quantityType: 'Number', calculationFactor: 1}
  };
  // wrap eLabSDK.API.Call in a promise so that we can await it
  function api_call(opts) {
    return new Promise((resolve, reject) => {
      eLabSDK.API.call(Object.assign({}, opts, {
        onSuccess: (xhr, status, resp) => {
          // Check for HTTP status code 2xx
          if (xhr && xhr.status && (xhr.status < 200 || xhr.status >= 300)) {
            reject({ error: `HTTP error ${xhr.status}`, xhr, resp });
          } else {
            resolve(resp);
          }
        },
        onError: (xhr, status, error) => reject({ error, xhr, status })
      }));
    });
  }

  // Normalise label: 
  // turn null/undef into empty string
  // replace NBSP with normal space
  // collapse any sequence of whitespace
  // remove spaces immediately inside brackets
  // strip leading/trailing whitespace
  // strip trailing colon and lowercase
  function normalise_label(s) {
    let t = (s || "").replace(/\u00a0/g, " ");
    t = t.replace(/\s+/g, " ");
    t = t.replace(/\s*\(\s*/g, "(").replace(/\s*\)\s*/g, ")");
    t = t.trim().replace(/:$/, "").toLowerCase();
    return t; 
  }

  // prompt the user for the section header of relevant experiment section
  function prompt_for_section_header() {
    return new Promise((resolve) => {
      if (eLabSDK2.UI.Modal) {
        const modal = eLabSDK2.UI.Modal.create({
          title: 'Enter Section Header of Sample Table',
          content:`
            <div>
              <p>Please enter the section header of the experiment section containing the sample table:</p>
              <input type="text" id="sectionHeaderInput" placeholder="e.g., Materials/Reagents/Chemicals/ etc." style="width: 100%; padding: 8px; box-sizing: border-box;">
            </div>
            <div style="margin-top: 10px; text-align: right;">
              <button id="ASRconfirmButton" class="btn btn-primary">Confirm</button>
              <button id="ASRcancelButton" class="btn btn-secondary">Cancel</button>
            </div>
          `,
          width: 450,
        });
        modal.open();

      

        modal.getElement().querySelector('#ASRconfirmButton').addEventListener('click', () => {
          const sectionHeader = modal.getElementById('sectionHeaderInput').value; // MIGHT HAVE TO CHANGE THIS TO BE MORE ACCURATE
          modal.close();
          // send the section header back to the caller
          resolve(sectionHeader);
        });

        modal.getElement().querySelector('#ASRcancelButton').addEventListener('click', () => {
          modal.close();
          resolve(null); 
        });
      } else {
        // Fallback to a simple prompt if Modal is not available
        const raw = window.prompt("Enter the section header of the experiment section containing the sample table:");
        if (raw === null) {
          return resolve(null);
        } else {
          resolve(raw);
        }
      }
    });
  }

  // Helper function to clean numeric string, tailored for "amount used"
  function clean_numeric_string(s) {
    if (typeof s !== 'string' || s.length === 0) {
      return "";
    }
    // Allows digits and a single decimal point
    let saw_decimal = false;
    return Array.from(s).filter(char => {
      if (char === '.') {
        if (saw_decimal) return false; // Ignore additional decimal points
        saw_decimal = true;
        return true; // Keep the first decimal point
      }
      return /[0-9]/.test(char); 
    }).join("");
  }

  async function parse_html(html_text) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html_text, 'text/html');
    const samples_map = new Map(); // Stores {sampleID: {sampleName, amountUsed, unitFromTable} }

    let media_table = null;
    // try to find specific table by looking for characteristic headers
    const tables = doc.querySelectorAll('table');
    for (const table of tables) {
      const ths = Array.from(table.querySelectorAll('thead th')).map(th => th.textContent.trim());
      // check for presence of "Item and "Amount used" columns
      if (ths.includes('Item') && ths.includes('Amount used')) {
        media_table = table;
        break; // Found the table, no need to continue
      }
    }

    if (!media_table) {
      console.error("EC_ASR_BUTTON: Could not find the media table in the section HTML.");
      eLabSDK2.UI.Toast.showToast('Could not find the media table in the section HTML.');
      return samples_map;
    }

    const rows = media_table.querySelectorAll('tbody tr');

    rows.forEach(row => {
      const cells = row.querySelectorAll('td');
      // "Item" is in the 1st cell (index 0), 
      // "Amount used" is in the 6th cell (index 5)
      // "Unit" for "Amount used" is in the 7th cell (index 6)
      if (cells.length >= 7) {
        const item_cell = cells[0];
        const amount_used_cell = cells[5];
        const unit_cell = cells[6];

        let sampleID = null;
        let sampleName = null;
        let amountUsedStr = null;
        let unitFromTable = null;

        // extract sample name and id from the 1st cell
        const anchor = item_cell.querySelector('a[onclick*="Experiment.Section.Sample.view"]');
        if (anchor) {
          sampleName = anchor.textContent.trim();
          const onclickAttr = anchor.getAttribute('onclick');
          const match = onclickAttr.match(/Experiment\.Section\.Sample\.view\((\d+)\)/);
          if (match && match[1]) {
            sampleID = match[1];
          }
        }
        
        // Extract amont used from the 6th cell
        // val is typically in nested span
        const amount_used_span = amount_used_cell.querySelector('span.protVar');
        if (amount_used_span) {
          amountUsedStr = amount_used_span.textContent.trim();
        }

        const unit_span = unit_cell.querySelector('span.protVar');
        if (unit_span) {
          unitFromTable = unit_span.textContent.trim().toLowerCase(); // normalise to lowercase
        }

        if (amountUsedStr) {
          amountUsedStr = clean_numeric_string(amountUsedStr);
        }

        if (sampleID && sampleName && amountUsedStr !== "" && unitFromTable && unitFromTable !== "") {
          const numericAmount = parseFloat(amountUsedStr);
          // only add if amount is a valid +ve number
          if (!isNaN(numericAmount) && numericAmount > 0) {
            samples_map.set(sampleID, { sampleName, amountUsed: numericAmount, unitFromTable });
            console.log(`EC_ASR_BUTTON: Found sample ID ${sampleID} ("${sampleName}"): ${numericAmount} ${unitFromTable}`);
          } else {
            console.warn(`EC_ASR_BUTTON: Item "${sampleName}" (ID: ${sampleID}) has an invalid amount used: "${amountUsedStr}" or missing unit: "${unitFromTable}".`);
          }
        }
      }
    });
    return samples_map;
  }


  // Automatic Sample Reduction (ASR)!
  // 1. Ask for section header of the relevant experiment section
  // 2. Using the provided section header, get the experiment section (API or via expData)
  // 3. Get the section's html
  // 4. Parse the table, collecting all the sample IDs and amount to reduce
  // 5. Get all the sample IDs quantities, and ask the user to confirm reduction by the amount
  // 6. If confirmed, for each sample call POST /samples/{sampleID}/quantity/subtract
  // 7. show toasts and handle errors

  async function ASR(expID, expData) {
    if (!expID) {
      eLabSDK2.UI.Toast.showToast('Experiment ID is not defined!');
      console.error("EC_ASR_BUTTON: Experiment ID is not defined.");
      return;
    }
    try {    
      // 1. Ask for section header of the relevant experiment section
      const sectionHeader = await prompt_for_section_header();
      if (!sectionHeader) {
        eLabSDK2.UI.Toast.showToast('Section header not provided. ASR cancelled.');
        console.error("EC_ASR_BUTTON: Section header not provided. ASR cancelled.");
        return;
      }

      console.log(`EC_ASR_BUTTON: Section header provided: ${sectionHeader}`);

      // 2. Using the provided section header, get the experiment section
      // if expData.data is present use that to gather the section,
      // otherwise GET /experiments/{expID}/sections
      let target_section;
      let html_text = null;

      if (expData && Array.isArray(expData.data)) {
        target_section = expData.data.find(section => normalise_label(section.sectionHeader) === normalise_label(sectionHeader));
        console.log(`EC_ASR_BUTTON: Found section in expData.data: ${target_section ? target_section.sectionHeader : 'not found'}`);
      }

      // If not found in expData, try the API
      if (!target_section) {
        console.log("EC_ASR_BUTTON: Section not found in expData, trying API call.");
        let sections_resp;
        try {
          sections_resp = await api_call({
            method: 'GET',
            path: 'experiments/{expID}/sections',
            pathParams: { expID: expID }
          });
        } catch (error) {
          eLabSDK2.UI.Toast.showToast(`Error fetching sections for experiment ${expID}`);
          console.error(`EC_ASR_BUTTON: Error fetching sections for experiment ${expID}:`, error);
          return;
        }

        const all_sections = sections_resp.data || sections_resp;
        const found_section_from_api = all_sections.find(section => normalise_label(section.sectionHeader) === normalise_label(sectionHeader));
        if (found_section_from_api) {
          target_section = {
            expJournalID: found_section_from_api.expJournalID,
            sectionHeader: found_section_from_api.sectionHeader
          };
        }
        console.log(`EC_ASR_BUTTON: Found section in API response: ${target_section ? target_section.sectionHeader : 'not found'}`);
      }

      if (!target_section) {
        eLabSDK2.UI.Toast.showToast(`Section "${sectionHeader}" not found in experiment ${expID}. ASR cancelled.`);
        console.error(`EC_ASR_BUTTON: Section "${sectionHeader}" not found in experiment ${expID}. ASR cancelled.`);
        return;
      }

      // 3. Get the section's html and parse the table
      if (typeof target_section.contents === 'string' && target_section.contents.trim() !== '') {
        html_text = target_section.contents;
        console.log("EC_ASR_BUTTON: Using section contents from expData.");
      }

      if (!html_text) {
        try {
          html_resp = await api_call({
            method: 'GET',
            path: 'experiments/sections/{expJournalID}/html',
            pathParams: { expJournalID: target_section.expJournalID }
          });
          html_text = html_resp.data || html_resp.html || html_resp;
        } catch (error) {
          eLabSDK2.UI.Toast.showToast(`Error fetching section HTML for section ${target_section.expJournalID}`);
          console.error(`EC_ASR_BUTTON: Error fetching section HTML for section ${target_section.expJournalID}:`, error);
          return;
        }
        console.log("EC_ASR_BUTTON: Fetched section HTML from API.");
      }

      // 4. Now parse the HTML to get the sample IDs and amount to reduce
      const extracted_data = await parse_html(html_text);

      if (extracted_data.size === 0) {
        eLabSDK2.UI.Toast.showToast('No samples found in the specified section.');
        console.warn("EC_ASR_BUTTON: No samples found in the specified section.");
        return;
      }

      // Have to scale the amounts based on the unit
      const samples_for_reduction = [];
      let preparation_errors = false;

      for (const [sampleID, table_data] of extracted_data) {
        try {
          const sample_quantity_settings_resp = await api_call({
            method: 'GET',
            path: 'samples/{sampleID}/quantity',
            pathParams: { sampleID: sampleID }
          });
          const sample_settings = sample_quantity_settings_resp.data || sample_quantity_settings_resp;
          const table_unit_def = UNIT_DEFINITIONS[table_data.unitFromTable];

          if (!table_unit_def) {
            console.warn(`EC_ASR_BUTTON: Unknown unit "${table_data.unitFromTable}" for sample ID ${sampleID} (${table_data.sampleName}). Skipping.`);
            eLabSDK2.UI.Toast.showToast(`Unknown unit "${table_data.unitFromTable}" for sample ID ${sampleID} (${table_data.sampleName}). Skipping.`);
            preparation_errors = true;
            continue; // Skip this sample
          }

          if (table_unit_def.quantityType !== sample_settings.quantityType) {
            console.warn(`EC_ASR_BUTTON: Quantity type mismatch for sample ID ${sampleID} (${table_data.sampleName}). Expected ${sample_settings.quantityType}, got ${table_unit_def.quantityType}. Skipping.`);
            eLabSDK2.UI.Toast.showToast(`Quantity type mismatch for sample ID ${sampleID} (${table_data.sampleName}). Expected ${sample_settings.quantityType}, got ${table_unit_def.quantityType}. Skipping.`);
            preparation_errors = true;
            continue; // Skip this sample
          }

          // i.e if in ml we do amount from table * 0.001
          const amount_to_subtract_in_base_unit = table_data.amountUsed * table_unit_def.calculationFactor;

          samples_for_reduction.push({
            sampleID: sampleID,
            sampleName: table_data.sampleName,
            amountFromTable: table_data.amountUsed, // Original amount from table
            unitFromTable: table_data.unitFromTable,   // Original unit from table
            amountToSubtract: amount_to_subtract_in_base_unit, // Amount converted to sample's base unit
            sampleBaseUnitName: sample_settings.unit // e.g. "Gram", "Liter" for logging/debug
          });

        } catch (error) {
          console.error(`EC_ASR_BUTTON: Error fetching sample settings for sample ID ${sampleID} (${table_data.sampleName}):`, error);
          eLabSDK2.UI.Toast.showToast(`Error fetching sample settings for sample ID ${sampleID} (${table_data.sampleName}). Check console for details.`);
          preparation_errors = true;
        }
      }

      if (samples_for_reduction.length === 0) {
        const msg = preparation_errors ? 'No samples eligible for reduction after checks and errors' : 'No samples found matching criteria for reduction';
        eLabSDK2.UI.Toast.showToast(msg);
        console.warn(`EC_ASR_BUTTON: ${msg}`);
        return;
      }

      // 5. build confirmation prompt
      let confirmation_message_parts = ["Are you sure you want to subtract the following amounts from inventory?"];
      samples_for_reduction.forEach(sample => {
        confirmation_message_parts.push(`- ${sample.amountFromTable} ${sample.unitFromTable} of ${sample.sampleName} (ID: ${sample.sampleID})`);
      });
      const confirmation_message = confirmation_message_parts.join('\n');

      const confirmed = await new Promise((resolve) => {
        if (window.eLabSDK2 && eLabSDK2.UI && eLabSDK2.UI.Modal) {
          const modal = eLabSDK2.UI.Modal.create({
            title: 'Confirm Sample Quantity Reduction',
            content: `<div style="white-space: pre-wrap; max-height: 300px; overflow-y: auto;">${confirmation_message}</div>
                      <div style="margin-top:15px; text-align:right;">
                      <button id="asrConfirmOkBtn" class="btn btn-primary">Confirm</button>
                      <button id="asrConfirmCancelBtn" class="btn btn-secondary">Cancel</button>
                      </div>`,
            width: 500,
          });
          modal.open();
          modal.getElement().querySelector('#asrConfirmOkBtn').addEventListener('click', () => {
            modal.close();
            resolve(true);
          });
          modal.getElement().querySelector('#asrConfirmCancelBtn').addEventListener('click', () => {
            modal.close();
            resolve(false);
          });
        } else {
          // Fallback to a simple confirm dialog if Modal is not available
          const raw = window.confirm(confirmation_message + "\n\nClick OK to confirm, Cancel to abort.");
          resolve(raw);
        }
      });

      // 6. If confirmed, make API calls to subtract the quantities
      if (confirmed) {
        console.log("EC_ASR_BUTTON: User confirmed the sample quantity reduction.");
        let allSucceeded = true;
        for (const sample of samples_for_reduction) {
          try {
            await api_call({
              method: 'POST',
              path: 'samples/{sampleID}/quantity/subtract',
              pathParams: { sampleID: sample.sampleID },
              body: parseFloat(sample.amountToSubtract)
            });
            const successMsg = `Successfully subtracted ${sample.amountFromTable} ${sample.unitFromTable} from ${sample.sampleName} (ID: ${sample.sampleID}).`;
            console.log(`EC_ASR_BUTTON: ${successMsg} (Converted to ${sample.amountToSubtract} ${sample.sampleBaseUnitName})`);
            eLabSDK2.UI.Toast.showToast(successMsg);
          } catch (error) {
            allSucceeded = false;
            const errorMsg = `Error subtracting ${sample.amountFromTable} ${sample.unitFromTable} for ${sample.sampleName} (ID: ${sample.sampleID}).`;
            console.error(`EC_ASR_BUTTON: ${errorMsg}`, error);
            eLabSDK2.UI.Toast.showToast(`${errorMsg} Check console.`);
          }
        }

        // 7. Show final toast based on success of all operations
        if (allSucceeded) {
          eLabSDK2.UI.Toast.showToast('All sample quantities successfully subtracted.');
          console.log("EC_ASR_BUTTON: All sample quantities successfully subtracted.");
        } else {
          eLabSDK2.UI.Toast.showToast('Some sample quantities could not be subtracted. Check console for details.');
          console.warn("EC_ASR_BUTTON: Some sample quantities could not be subtracted.");
        }
      } else {
        eLabSDK2.UI.Toast.showToast('Sample quantity reduction cancelled by user.');
        console.log("EC_ASR_BUTTON: Sample quantity reduction cancelled by user.");
      }


    } catch (error) {
      console.error("EC_ASR_BUTTON: An error occurred while subtracting sample quantity:", error);
      eLabSDK2.UI.Toast.showToast('An error occurred while subtracting sample quantity. Check console for details.');
    }
  }
      
  // ---------------------------------------------------------------
  // inserting button into the Experiment Action Buttons + into Navbar for redundancy
  // also just in case
  // ---------------------------------------------------------------
  context.init = function () {
    console.log("EC_ASR_BUTTON:init() called");

    function try_insert_button() {
        // locate UL that holds all experiment action <li> items
        const ul = document.querySelector("#experimentactionbuttons ul#options");
        if (!ul) {
            console.warn("EC_ASR_BUTTON: Could not find the experiment action buttons UL element.");
            return false;
        }

        // if button already inserted
        if (document.getElementById("ASRInBodyButton")) {
            console.warn("EC_ASR_BUTTON: Button already exists, not inserting again.");
            return true;
        }

        // locate <span id="sdk2actions">
        const sdk2actions = ul.querySelector("#sdk2actions");
        if (!sdk2actions) {
            console.warn("EC_ASR_BUTTON: Could not find the sdk2actions span element.");
            return false;
        }

        // build new <li> element
        const li = document.createElement("li");
        li.id = "ASRInBodyButton";
        li.style.display = "inherit"; 

        // inside the <li> create the <a> with icon + text
        const a = document.createElement("a");
        a.title = "ASR";
        a.classList.add("addIcon");
        a.style.cursor = "pointer";

        // create <i> icon
        const icon = document.createElement("i");
        icon.classList.add("fas", "fa-minus-circle");
        icon.style.marginRight = "4px"; // Add some space between icon and text

        const txt = document.createTextNode("ASR");

        a.appendChild(icon);
        a.appendChild(txt);

        // attach click handler to <a>
        a.addEventListener("click", (e) => {
            e.preventDefault();
            console.log("EC_ASR_BUTTON: In-Body ASR button clicked");
            ep = new eLabSDK.Page.Experiment();
            expID = ep.getExperimentID();
            expData = ep.getExperimentData();
            console.log(`Experiment ID: ${expID}`);
            eLabSDK2.UI.Toast.showToast('ASR clicked!');
            ASR(expID, expData);
        });

        li.appendChild(a);

        ul.insertBefore(li, sdk2actions);

        return true;
    }

    let attempts = 0;
    const interval = setInterval(() => {
        if (try_insert_button() || attempts++ > 20) {
            clearInterval(interval);
            if (attempts > 20) {
                console.warn("EC_ASR_BUTTON: Failed to insert button after multiple attempts.");
            } else {
                // console.log("EC_ASR_BUTTON: Button inserted successfully.");
                console.log("EC_ASR_BUTTON: Button inserted successfully.");
            }
        }
    }, 500);

    // Define the minimal button config using 'action' instead of 'onClick'
    const ASRDataNavButton = {
      id: 'ASRDataNavButton',
      label: 'ASR',
      icon: 'fas fa-minus-circle',
      action: () => {
        console.log("EC_ASR_BUTTON: Nav-Bar ASR button clicked");
        ep = new eLabSDK.Page.Experiment();
        expID = ep.getExperimentID();
        expData = ep.getExperimentData();
        console.log(`Experiment ID: ${expID}`);
        eLabSDK2.UI.Toast.showToast('ASR clicked!');
        ASR(expID, expData);
      }
    };

    // Documentation is confusing and not sure so basically try everything and see what happens:
    // Try the Journal-Experiment Navigation first
    if (
      eLabSDK2.Journal &&
      eLabSDK2.Journal.Experiment &&
      eLabSDK2.Journal.Experiment.UI &&
      eLabSDK2.Journal.Experiment.UI.Navigation &&
      typeof eLabSDK2.Journal.Experiment.UI.Navigation.addMainMenuAction === 'function'
    ) {
      console.log(
        "EC_ASR_BUTTON: Registering via eLabSDK2.Journal.Experiment.UI.Navigation.addMainMenuAction"
      );
      eLabSDK2.Journal.Experiment.UI.Navigation.addMainMenuAction(ASRDataNavButton);
      return;
    }

    // Fallback to the older Section Navigation namespace
    if (
      eLabSDK2.Experiment &&
      eLabSDK2.Experiment.Section &&
      eLabSDK2.Experiment.Section.UI &&
      eLabSDK2.Experiment.Section.UI.Navigation &&
      typeof eLabSDK2.Experiment.Section.UI.Navigation.addMainMenuAction === 'function'
    ) {
      console.log(
        "EC_ASR_BUTTON: Registering via eLabSDK2.Experiment.Section.UI.Navigation.addMainMenuAction"
      );
      eLabSDK2.Experiment.Section.UI.Navigation.addMainMenuAction(ASRDataNavButton);
      return;
    }

    console.warn(
      "EC_ASR_BUTTON: Couldn't find a Navigation API to add a main‐menu button."
    );
  };
})(EC_ASR_BUTTON);
