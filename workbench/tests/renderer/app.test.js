import React from 'react';
import { ipcRenderer } from 'electron';
import {
  render, waitFor, within
} from '@testing-library/react';
import { act } from 'react-dom/test-utils';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';

import App from '../../src/renderer/app';
import {
  getInvestModelNames,
  getSpec,
  fetchValidation,
  fetchDatastackFromFile,
  getSupportedLanguages
} from '../../src/renderer/server_requests';
import InvestJob from '../../src/renderer/InvestJob';
import {
  getSettingsValue,
  saveSettingsStore,
  clearSettingsStore,
} from '../../src/renderer/components/SettingsModal/SettingsStorage';

import { mockUISpec } from './utils';

// It's quite a pain to dynamically mock a const from a module,
// here we do it by importing as another object, then
// we can overwrite the object we want to mock later
// https://stackoverflow.com/questions/42977961/how-to-mock-an-exported-const-in-jest
import * as uiConfig from '../../src/renderer/ui_config';

jest.mock('../../src/renderer/server_requests');

const MOCK_MODEL_TITLE = 'Carbon';
const MOCK_MODEL_RUN_NAME = 'carbon';
const MOCK_INVEST_LIST = {
  [MOCK_MODEL_TITLE]: {
    model_name: MOCK_MODEL_RUN_NAME,
  },
};
const MOCK_VALIDATION_VALUE = [[['workspace_dir'], 'invalid because']];

const SAMPLE_SPEC = {
  model_name: MOCK_MODEL_TITLE,
  pyname: 'natcap.invest.carbon',
  userguide: 'carbonstorage.html',
  args: {
    workspace_dir: {
      name: 'Workspace',
      about: 'help text',
      type: 'directory',
    },
    carbon_pools_path: {
      name: 'Carbon Pools',
      about: 'help text',
      type: 'csv',
    },
  },
};

// Because we mock UI_SPEC without using jest's API
// we also need to reset it without jest's API.
const { UI_SPEC } = uiConfig;
afterEach(() => {
  uiConfig.UI_SPEC = UI_SPEC;
});

describe('Various ways to open and close InVEST models', () => {
  beforeEach(async () => {
    getInvestModelNames.mockResolvedValue(MOCK_INVEST_LIST);
    getSpec.mockResolvedValue(SAMPLE_SPEC);
    fetchValidation.mockResolvedValue(MOCK_VALIDATION_VALUE);
    uiConfig.UI_SPEC = mockUISpec(SAMPLE_SPEC, MOCK_MODEL_RUN_NAME);
  });

  afterEach(async () => {
    await InvestJob.clearStore(); // because a test calls InvestJob.saveJob()
  });

  test('Clicking an invest model button renders SetupTab', async () => {
    const { findByText, findByRole } = render(
      <App />
    );

    const carbon = await findByRole(
      'button', { name: MOCK_MODEL_TITLE }
    );
    await userEvent.click(carbon);
    const executeButton = await findByRole('button', { name: /Run/ });
    expect(executeButton).toBeDisabled();
    const setupTab = await findByText('Setup');
    expect(setupTab.classList.contains('active')).toBeTruthy();
    expect(getSpec).toHaveBeenCalledTimes(1);
    const navTab = await findByRole('tab', { name: MOCK_MODEL_TITLE });
    await userEvent.hover(navTab);
    await findByRole('tooltip', { name: MOCK_MODEL_TITLE });
  });

  test('Clicking a recent job renders SetupTab', async () => {
    const workspacePath = 'my_workspace';
    const argsValues = {
      workspace_dir: workspacePath,
    };
    const mockJob = new InvestJob({
      modelRunName: 'carbon',
      modelHumanName: 'Carbon Sequestration',
      argsValues: argsValues,
      status: 'success',
    });
    await InvestJob.saveJob(mockJob);

    const { findByText, findByLabelText, findByRole } = render(
      <App />
    );

    const recentJobCard = await findByText(
      argsValues.workspace_dir
    );
    await userEvent.click(recentJobCard);
    const executeButton = await findByRole('button', { name: /Run/ });
    expect(executeButton).toBeDisabled();
    const setupTab = await findByText('Setup');
    expect(setupTab.classList.contains('active')).toBeTruthy();

    // Expect some arg values that were loaded from the saved job:
    const input = await findByLabelText(SAMPLE_SPEC.args.workspace_dir.name);
    expect(input).toHaveValue(
      argsValues.workspace_dir
    );
  });

  test('Open File: Dialog callback renders SetupTab', async () => {
    const mockDialogData = {
      canceled: false,
      filePaths: ['foo.json'],
    };
    const mockDatastack = {
      args: {
        carbon_pools_path: 'Carbon/carbon_pools_willamette.csv',
      },
      module_name: 'natcap.invest.carbon',
      model_run_name: 'carbon',
      model_human_name: 'Carbon',
    };
    ipcRenderer.invoke.mockResolvedValue(mockDialogData);
    fetchDatastackFromFile.mockResolvedValue(mockDatastack);

    const { findByText, findByLabelText, findByRole } = render(
      <App />
    );

    const openButton = await findByRole('button', { name: 'Open' });
    expect(openButton).not.toBeDisabled();
    await userEvent.click(openButton);
    const executeButton = await findByRole('button', { name: /Run/ });
    expect(executeButton).toBeDisabled();
    const setupTab = await findByText('Setup');
    const input = await findByLabelText(
      SAMPLE_SPEC.args.carbon_pools_path.name
    );
    expect(setupTab.classList.contains('active')).toBeTruthy();
    expect(input).toHaveValue(mockDatastack.args.carbon_pools_path);
  });

  test('Open File: Dialog callback is canceled', async () => {
    // Resembles callback data if the dialog was canceled
    const mockDialogData = {
      canceled: true,
      filePaths: [],
    };
    ipcRenderer.invoke.mockResolvedValue(mockDialogData);

    const { findByRole } = render(
      <App />
    );

    const openButton = await findByRole('button', { name: 'Open' });
    await userEvent.click(openButton);
    const homeTab = await findByRole('tabpanel', { name: 'home tab' });
    // expect we're on the same tab we started on instead of switching to Setup
    expect(homeTab.classList.contains('active')).toBeTruthy();
    // These are the calls that would have triggered if a file was selected
    expect(fetchDatastackFromFile).toHaveBeenCalledTimes(0);
    expect(getSpec).toHaveBeenCalledTimes(0);
  });

  test('Open three tabs and close them', async () => {
    const {
      findByRole,
      findAllByRole,
      queryAllByRole,
    } = render(<App />);

    const carbon = await findByRole(
      'button', { name: MOCK_MODEL_TITLE }
    );
    const homeTab = await findByRole('tabpanel', { name: 'home tab' });

    // Open a model tab and expect that it's active
    await userEvent.click(carbon);
    let modelTabs = await findAllByRole('tab', { name: MOCK_MODEL_TITLE });
    expect(modelTabs).toHaveLength(1); // one carbon tab open
    const tab1 = modelTabs[0];
    const tab1EventKey = tab1.getAttribute('data-rb-event-key');
    expect(tab1.classList.contains('active')).toBeTruthy();
    expect(homeTab.classList.contains('active')).toBeFalsy();

    // Open a second model tab and expect that it's active
    await userEvent.click(homeTab);
    await userEvent.click(carbon);
    modelTabs = await findAllByRole('tab', { name: MOCK_MODEL_TITLE });
    expect(modelTabs).toHaveLength(2); // 2 carbon tabs open
    const tab2 = modelTabs[1];
    const tab2EventKey = tab2.getAttribute('data-rb-event-key');
    expect(tab2.classList.contains('active')).toBeTruthy();
    expect(tab1.classList.contains('active')).toBeFalsy();
    expect(homeTab.classList.contains('active')).toBeFalsy();
    // make sure that we switched away from the first tab
    expect(tab2EventKey).not.toEqual(tab1EventKey);

    // Open a third model tab and expect that it's active
    await userEvent.click(homeTab);
    await userEvent.click(carbon);
    modelTabs = await findAllByRole('tab', { name: MOCK_MODEL_TITLE });
    expect(modelTabs).toHaveLength(3); // 3 carbon tabs open
    const tab3 = modelTabs[2];
    const tab3EventKey = tab3.getAttribute('data-rb-event-key');
    expect(tab3.classList.contains('active')).toBeTruthy();
    expect(tab2.classList.contains('active')).toBeFalsy();
    expect(tab1.classList.contains('active')).toBeFalsy();
    expect(homeTab.classList.contains('active')).toBeFalsy();
    // make sure that we switched away from the first model tabs
    expect(tab3EventKey).not.toEqual(tab2EventKey);
    expect(tab3EventKey).not.toEqual(tab1EventKey);

    // Click the close button on the middle tab
    const tab2CloseButton = await within(tab2.closest('.nav-item'))
      .getByRole('button', { name: new RegExp(`close ${MOCK_MODEL_TITLE}`) });
    await userEvent.click(tab2CloseButton);
    // Now there should only be 2 model tabs open
    modelTabs = await findAllByRole('tab', { name: MOCK_MODEL_TITLE });
    expect(modelTabs).toHaveLength(2);
    // Should have switched to tab3, the next tab to the right
    expect(tab3.classList.contains('active')).toBeTruthy();
    expect(tab1.classList.contains('active')).toBeFalsy();

    // Click the close button on the right tab
    const tab3CloseButton = await within(tab3.closest('.nav-item'))
      .getByRole('button', { name: new RegExp(`close ${MOCK_MODEL_TITLE}`) });
    await userEvent.click(tab3CloseButton);
    // Now there should only be 1 model tab open
    modelTabs = await findAllByRole('tab', { name: MOCK_MODEL_TITLE });
    expect(modelTabs).toHaveLength(1);
    // No model tabs to the right, so it should switch to the next tab to the left.
    expect(tab1.classList.contains('active')).toBeTruthy();
    expect(homeTab.classList.contains('active')).toBeFalsy();

    // Click the close button on the last tab
    const tab1CloseButton = await within(tab1.closest('.nav-item'))
      .getByRole('button', { name: new RegExp(`close ${MOCK_MODEL_TITLE}`) });
    await userEvent.click(tab1CloseButton);
    // Now there should be no model tabs open.
    modelTabs = await queryAllByRole('tab', { name: MOCK_MODEL_TITLE });
    expect(modelTabs).toHaveLength(0);
    // No more model tabs, so it should switch back to the home tab.
    expect(homeTab.classList.contains('active')).toBeTruthy();
  });
});

describe('Display recently executed InVEST jobs on Home tab', () => {
  beforeEach(() => {
    getInvestModelNames.mockResolvedValue({});
  });

  afterEach(async () => {
    await InvestJob.clearStore();
  });

  test('Recent Jobs: each has a button', async () => {
    const job1 = new InvestJob({
      modelRunName: 'carbon',
      modelHumanName: 'Carbon Sequestration',
      argsValues: {
        workspace_dir: 'work1',
      },
      status: 'success',
    });
    await InvestJob.saveJob(job1);
    const job2 = new InvestJob({
      modelRunName: 'sdr',
      modelHumanName: 'Sediment Ratio Delivery',
      argsValues: {
        workspace_dir: 'work2',
        results_suffix: 'suffix',
      },
      status: 'error',
    });
    const recentJobs = await InvestJob.saveJob(job2);
    const initialJobs = [job1, job2];

    const { getByText } = render(<App />);

    await waitFor(() => {
      initialJobs.forEach((job, idx) => {
        const recent = recentJobs[idx];
        const card = getByText(job.modelHumanName)
          .closest('button');
        expect(within(card).getByText(job.argsValues.workspace_dir))
          .toBeInTheDocument();
        if (job.status === 'success') {
          expect(getByText('Model Complete'))
            .toBeInTheDocument();
        }
        if (job.status === 'error') {
          expect(getByText(job.status))
            .toBeInTheDocument();
        }
        if (job.argsValues.results_suffix) {
          expect(getByText(job.argsValues.results_suffix))
            .toBeInTheDocument();
        }
        // The timestamp is not part of the initial object, but should
        // in the saved object
        expect(within(card).getByText(recent.humanTime))
          .toBeInTheDocument();
      });
    });
  });

  test('Recent Jobs: a job with incomplete data is skipped', async () => {
    const job1 = new InvestJob({
      modelRunName: 'carbon',
      modelHumanName: 'invest A',
      argsValues: {
        workspace_dir: 'dir',
      },
      status: 'success',
    });
    const job2 = new InvestJob({
      // argsValues is missing
      modelRunName: 'sdr',
      modelHumanName: 'invest B',
      status: 'success',
    });
    await InvestJob.saveJob(job1);
    await InvestJob.saveJob(job2);

    const { findByText, queryByText } = render(<App />);

    expect(await findByText(job1.modelHumanName)).toBeInTheDocument();
    expect(queryByText(job2.modelHumanName)).toBeNull();
  });

  test('Recent Jobs: placeholder if there are no recent jobs', async () => {
    const { findByText } = render(
      <App />
    );

    const node = await findByText(/Set up a model from a sample datastack file/);
    expect(node).toBeInTheDocument();
  });

  test('Recent Jobs: cleared by button', async () => {
    const job1 = new InvestJob({
      modelRunName: 'carbon',
      modelHumanName: 'Carbon Sequestration',
      argsValues: {
        workspace_dir: 'work1',
      },
      status: 'success',
    });
    const recentJobs = await InvestJob.saveJob(job1);

    const { getByText, findByText, getByRole } = render(<App />);

    await waitFor(() => {
      recentJobs.forEach((job) => {
        expect(getByText(job.argsValues.workspace_dir))
          .toBeTruthy();
      });
    });
    await userEvent.click(getByRole('button', { name: 'settings' }));
    await userEvent.click(getByText('Clear Recent Jobs'));
    const node = await findByText(/Set up a model from a sample datastack file/);
    expect(node).toBeInTheDocument();
  });
});

describe('InVEST global settings: dialog interactions', () => {
  const nWorkersLabelText = 'Taskgraph n_workers parameter';
  const loggingLabelText = 'Logging threshold';
  const tgLoggingLabelText = 'Taskgraph logging threshold';
  const languageLabelText = 'Language';

  const { location } = global.window;
  beforeAll(() => {
    // window.location.reload is not implemented in jsdom
    delete global.window.location;
    Object.defineProperty(global.window, 'location', {
      configurable: true,
      value: { reload: jest.fn() },
    });
  });

  afterAll(() => {
    Object.defineProperty(global.window, 'location', {
      configurable: true,
      value: location,
    });
  });

  beforeEach(async () => {
    getInvestModelNames.mockResolvedValue({});
    getSupportedLanguages.mockResolvedValue({ en: 'english', es: 'spanish' });
    ipcRenderer.invoke.mockImplementation(() => Promise.resolve());
  });

  afterEach(async () => {
    await clearSettingsStore();
  });

  test('Invest settings save on change', async () => {
    const nWorkersLabel = 'Threaded task management (0)';
    const nWorkersValue = '0';
    const loggingLevel = 'DEBUG';
    const tgLoggingLevel = 'DEBUG';
    const languageValue = 'es';

    const {
      getByText, getByRole, getByLabelText, findByRole,
    } = render(
      <App />
    );

    await userEvent.click(await findByRole('button', { name: 'settings' }));
    const nWorkersInput = getByLabelText(nWorkersLabelText, { exact: false });
    const loggingInput = getByLabelText(loggingLabelText);
    const tgLoggingInput = getByLabelText(tgLoggingLabelText);
    const languageInput = getByLabelText(languageLabelText, { exact: false });

    await userEvent.selectOptions(nWorkersInput, [getByText(nWorkersLabel)]);
    await waitFor(() => { expect(nWorkersInput).toHaveValue(nWorkersValue); });
    await userEvent.selectOptions(loggingInput, [loggingLevel]);
    await waitFor(() => { expect(loggingInput).toHaveValue(loggingLevel); });
    await userEvent.selectOptions(tgLoggingInput, [tgLoggingLevel]);
    await waitFor(() => { expect(tgLoggingInput).toHaveValue(tgLoggingLevel); });
    await userEvent.selectOptions(languageInput, [languageValue]);
    await waitFor(() => { expect(languageInput).toHaveValue(languageValue); });
    await userEvent.click(getByRole('button', { name: 'close settings' }));

    // Check values were saved in app and in store
    await userEvent.click(await findByRole('button', { name: 'settings' }));
    await waitFor(() => {
      expect(nWorkersInput).toHaveValue(nWorkersValue);
      expect(loggingInput).toHaveValue(loggingLevel);
      expect(tgLoggingInput).toHaveValue(tgLoggingLevel);
      expect(languageInput).toHaveValue(languageValue);
    });
    expect(await getSettingsValue('nWorkers')).toBe(nWorkersValue);
    expect(await getSettingsValue('loggingLevel')).toBe(loggingLevel);
    expect(await getSettingsValue('taskgraphLoggingLevel')).toBe(tgLoggingLevel);
    expect(await getSettingsValue('language')).toBe(languageValue);
  });

  test('Load invest settings from storage and test Reset', async () => {
    const defaultSettings = {
      nWorkers: '-1',
      loggingLevel: 'INFO',
      taskgraphLoggingLevel: 'ERROR',
      language: 'en',
    };
    const expectedSettings = {
      nWorkers: '0',
      loggingLevel: 'ERROR',
      taskgraphLoggingLevel: 'INFO',
      language: 'en',
    };

    await saveSettingsStore(expectedSettings);

    const {
      getByText, getByLabelText, findByRole,
    } = render(<App />);

    await userEvent.click(await findByRole('button', { name: 'settings' }));
    const nWorkersInput = getByLabelText(nWorkersLabelText, { exact: false });
    const loggingInput = getByLabelText(loggingLabelText);
    const tgLoggingInput = getByLabelText(tgLoggingLabelText);
    const languageInput = getByLabelText(languageLabelText, { exact: false });

    // Test that the invest settings were loaded in from store.
    await waitFor(() => {
      expect(nWorkersInput).toHaveValue(expectedSettings.nWorkers);
      expect(loggingInput).toHaveValue(expectedSettings.loggingLevel);
      expect(tgLoggingInput).toHaveValue(expectedSettings.tgLoggingLevel);
      expect(languageInput).toHaveValue(expectedSettings.language);
    });

    // Test Reset sets values to default
    await userEvent.click(getByText('Reset to Defaults'));
    await waitFor(() => {
      expect(nWorkersInput).toHaveValue(defaultSettings.nWorkers);
      expect(loggingInput).toHaveValue(defaultSettings.loggingLevel);
      expect(tgLoggingInput).toHaveValue(defaultSettings.tgLoggingLevel);
      expect(languageInput).toHaveValue(defaultSettings.language);
    });
  });

  test('Access sampledata download Modal from settings', async () => {
    const {
      findByText, findByRole, queryByText,
    } = render(
      <App />
    );

    const settingsBtn = await findByRole('button', { name: 'settings' });
    await userEvent.click(settingsBtn);
    await userEvent.click(
      await findByRole('button', { name: 'Download Sample Data' })
    );

    expect(await findByText('Download InVEST sample data'))
      .toBeInTheDocument();
    expect(queryByText('Settings')).toBeNull();
  });
});

describe('Translation', () => {
  const { location } = global.window;
  beforeAll(async () => {
    getInvestModelNames.mockResolvedValue({});
    getSupportedLanguages.mockResolvedValue({ en: 'english', ll: 'foo' });

    delete global.window.location;
    Object.defineProperty(global.window, 'location', {
      configurable: true,
      value: { reload: jest.fn() },
    });
  });

  afterAll(() => {
    Object.defineProperty(global.window, 'location', {
      configurable: true,
      value: location,
    });
  });

  test('Text rerenders in new language when language setting changes', async () => {
    const { findByLabelText } = render(<App />);

    await userEvent.click(await findByLabelText('settings'));
    const languageInput = await findByLabelText('Language', { exact: false });
    expect(languageInput).toHaveValue('en');

    await userEvent.selectOptions(languageInput, 'll');
    await waitFor(() => {
      expect(global.window.location.reload).toHaveBeenCalled();
    });
    // because we can't reload the window in the test environment,
    // components won't actually rerender in the new language
    expect(languageInput).toHaveValue('ll');
  });
});
