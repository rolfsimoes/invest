import React from 'react';
import { remote } from 'electron'; // eslint-disable-line import/no-extraneous-dependencies
import PropTypes from 'prop-types';

import Button from 'react-bootstrap/Button';

import Job from '../../Job';
import { fetchDatastackFromFile } from '../../server_requests';

/**
 * Render a button that loads args from a datastack, parameterset, or logfile.
 * Opens a native OS filesystem dialog to browse to a file.
 */
export default class LoadButton extends React.Component {
  constructor(props) {
    super(props);
    this.browseFile = this.browseFile.bind(this);
  }

  async browseFile(event) {
    const data = await remote.dialog.showOpenDialog();
    if (data.filePaths.length) {
      const datastack = await fetchDatastackFromFile(data.filePaths[0]);
      const job = new Job(
        datastack.model_run_name,
        datastack.model_human_name,
        datastack.args
      );
      this.props.openInvestModel(job);
    }
  }

  render() {
    return (
      <Button
        className="mx-3"
        onClick={this.browseFile}
        variant="outline-dark"
      >
        Load Parameters
      </Button>
    );
  }
}

LoadButton.propTypes = {
  openInvestModel: PropTypes.func.isRequired,
};
