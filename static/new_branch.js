var {
  FormGroup,
  ControlLabel,
  FormControl,
  HelpBlock
} = ReactBootstrap;

var {
  createElement
} = React;

class NewBranch extends React.Component {
  constructor(props) {
    super(props);
    this.state = {};
  }

  isRepoValid() {
    return this.state.repo;
  }

  isBranchValid() {
    return this.state.branch;
  }

  render() {
    return createElement(
      'form', {
        onSubmit: (ev) => {
          ev.preventDefault();
          this.props.onCreate({
            repo: this.state.repo,
            branch: this.state.branch,
            path: this.state.path
          });
        }
      },
      createElement(
        FormGroup, {
          controlId: 'new_branch_repo',
          validationState: this.isRepoValid() ? 'default' : 'error'
        },
        createElement(
          ControlLabel, {},
          'Repository:'
        ),
        createElement(
          FormControl, {
            type: 'text',
            value: this.state.repo,
            placeholder: 'git url',
            onChange: (ev) => {
              this.setState({
                repo: ev.target.value
              });
            }
          }
        )
      ),
      createElement(
        FormGroup, {
          controlId: 'new_branch_branch',
          validationState: this.isBranchValid() ? 'default' : 'error'
        },
        createElement(
          ControlLabel, {},
          'Branch:'
        ),
        createElement(
          FormControl, {
            type: 'text',
            value: this.state.branch,
            onChange: (ev) => {
              this.setState({
                branch: ev.target.value
              });
            }
          }
        )
      ),
      createElement(
        FormGroup, {
          controlId: 'new_branch_path'
        },
        createElement(
          ControlLabel, {},
          'Path:'
        ),
        createElement(
          FormControl, {
            type: 'text',
            value: this.state.path,
            onChange: (ev) => {
              this.setState({
                path: ev.target.value
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
            disabled: !(this.isRepoValid() && this.isBranchValid())
          }, 'Create'
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
