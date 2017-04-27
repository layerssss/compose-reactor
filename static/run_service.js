class RunService extends React.Component {
  constructor(props) {
    super(props);
    this.state = {};
  }

  render() {
    return createElement(
      'form', {
        onSubmit: ev => {
          ev.preventDefault();
          this.props.onRunService(this.state.command);
        }
      },
      createElement(
        FormGroup, {
          controlId: 'run_service_command'
        },
        createElement(
          ControlLabel, {},
          'Command:'
        ),
        createElement(
          FormControl, {
            type: 'text',
            value: this.state.command,
            onChange: ev => {
              this.setState({
                command: ev.target.value
              });
            }
          }
        )
      ),
      createElement(
        ButtonToolbar, {},
        createElement(
          Button, {
            type: 'submit',
            bsStyle: 'primary',
          }, 'Run'
        ),
        createElement(
          Button, {
            onClick: () => {
              this.props.onCancel();
            }
          }, 'Cancel'
        )
      )
    );
  }
}
