class MappingPort extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      protocol: 'tcp'
    };
  }

  render() {
    var services = this.props.branch.services || [];
    var service = _.find(services, s => s.name == this.state.serviceName);

    if (!this.state.serviceName) {
      this.state.serviceName = (services[0] || {}).name;
      service = _.find(services, s => s.name == this.state.serviceName);
    }

    var ports = service ? service.ports : [];
    ports = ports.filter(p => p.protocol == this.state.protocol);

    var port = _.find(ports, p => p.containerPort == this.state.containerPort);

    if (!port) {
      this.state.containerPort = (ports[0] || {}).containerPort;
      port = _.find(ports, p => p.containerPort == this.state.containerPort);
    }

    if (!this.state.publicPort) {
      this.state.publicPort = port ? port.containerPort : 1001;
    }

    return createElement(
      'form', {
        onSubmit: ev => {
          ev.preventDefault();
          this.props.onMap({
            serviceName: this.state.serviceName,
            containerPort: this.state.containerPort,
            publicPort: this.state.publicPort,
            protocol: this.state.protocol
          });
        }
      },
      createElement(
        FormGroup, {
          controlId: 'mapping_port_service_name'
        },
        createElement(
          ControlLabel, {},
          'Service:'
        ),
        createElement(
          FormControl, {
            componentClass: 'select',
            onChange: ev => {
              this.setState({
                serviceName: ev.target.value
              });
            }
          },
          services.map(service =>
            createElement(
              'option', {
                key: service.name,
                value: service.name,
                selected: this.state.serviceName == service.name
              },
              service.name
            )
          )
        )
      ),
      createElement(
        FormGroup, {
          controlId: 'mapping_port_protocol'
        },
        createElement(
          ControlLabel, {},
          'Protocol:'
        ),
        createElement(
          FormControl, {
            componentClass: 'select',
            onChange: ev => {
              this.setState({
                protocol: ev.target.value
              });
            }
          },
          ['tcp', 'udp'].map(protocol =>
            createElement(
              'option', {
                key: protocol,
                value: protocol,
                selected: this.state.protocol == protocol
              },
              protocol
            )
          )
        )
      ),
      createElement(
        FormGroup, {
          controlId: 'mapping_port_port'
        },
        createElement(
          ControlLabel, {},
          'Port:'
        ),
        createElement(
          FormControl, {
            componentClass: 'select',
            onChange: ev => {
              this.setState({
                containerPort: Number(ev.target.value)
              });
            }
          },
          ports.map(port =>
            createElement(
              'option', {
                key: port.containerPort,
                value: port.containerPort,
                selected: this.state.containerPort == port.containerPort
              },
              port.containerPort
            )
          )
        )
      ),
      createElement(
        FormGroup, {
          controlId: 'mapping_port_port'
        },
        createElement(
          ControlLabel, {},
          'Port:'
        ),
        createElement(
          FormControl, {
            type: 'number',
            min: 1001,
            value: this.state.publicPort,
            onChange: ev => {
              this.setState({
                publicPort: Number(ev.target.value)
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
