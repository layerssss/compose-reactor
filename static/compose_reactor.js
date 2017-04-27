class ComposeReactor extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      loaded: false
    };
  }

  doAction(name, parameters) {
    if (!this.state.loaded) return;

    this.socket.send(JSON.stringify({
      name: name,
      parameters: parameters
    }));
  }

  componentDidMount() {
    var initSocket = () => {
      var receivingFile = null;
      this.socket = new WebSocket(location.origin.replace(/^http/, 'ws'));

      this.socket.onmessage = (messageEvent) => {
        if (receivingFile) {
          OpenBlob(receivingFile.name, messageEvent.data);
          return receivingFile = null;
        }

        var {
          state,
          message,
          terminalOutput,
          file
        } = JSON.parse(messageEvent.data);

        if (state) {
          this.setState(state);
          this.setState({
            loaded: true,
            tries: 0
          });
        }

        if (message) {
          this.handleMessage(message);
        }

        if (terminalOutput) {
          var xTerm = this.refs[`xTerm_${terminalOutput.id}`];
          if (xTerm) {
            xTerm.write(terminalOutput.dataString);
          }
        }

        if (file) {
          receivingFile = file;
        }
      };

      this.socket.onerror = (errorEvent) => {
        this.handleMessage({
          type: 'danger',
          message: 'Connection error.'
        });

        this.setState({
          loaded: false
        });
      };

      this.socket.onclose = () => {
        this.setState({
          loaded: false,
        });

        setTimeout(initSocket, 1000);
      };
    }

    initSocket();
  }

  handleMessage(message) {
    $.notify({
      message: message.message
    }, {
      type: message.type
    });
  }

  componentWillUnmount() {
    this.socket.close();
  }

  render() {
    if (this.state.loaded) {
      document.title = `Compose Reactor`;
    }

    return createElement(
      'div', {
        className: 'compose_reactor',
        style: {
          padding: '2em 0'
        }
      },
      (this.state.loaded &&
        createElement(
          Grid, {
            fluid: true
          },
          createElement(
            'div', {},
            this.state.branches.map(branch =>
              createElement(
                Panel, {
                  header: `${branch.repo}#${branch.branch}${branch.path && ` (${branch.path})`}`,
                  collapsible: true
                },
                (branch.terminal ?
                  createElement(
                    XTerm, {
                      ref: `xTerm_${branch.terminal.id}`,
                      title: branch.terminal.title,
                      onResize: (cols, rows) => {
                        this.doAction('ResizeTerminal', {
                          id: branch.terminal.id,
                          cols,
                          rows
                        });
                      },
                      onData: dataString => {
                        if (branch.terminal.code) {
                          return this.doAction('DismissBranchTerminal', {
                            id: branch.id,
                          });
                        }
                        this.doAction('InputTerminal', {
                          id: branch.terminal.id,
                          dataString: dataString
                        });
                      }
                    }
                  ) :
                  createElement(
                    'div', {},
                    (this.state[`branch${branch.id}Mode`] == 'mappingPort' &&
                      createElement(
                        Panel, {
                          header: 'Mapping port:'
                        },
                        createElement(
                          MappingPort, {
                            branch: branch,
                            onMap: port => {
                              this.doAction('MapPort', _.merge(port, {
                                branchId: branch.id
                              }));

                              this.state[`branch${branch.id}Mode`] = null;
                              this.forceUpdate();
                            },
                            onCancel: () => {
                              this.state[`branch${branch.id}Mode`] = null;
                              this.forceUpdate();
                            }
                          }
                        )
                      )
                    ),
                    (this.state[`branch${branch.id}Mode`] == 'creatingRunService' &&
                      createElement(
                        Panel, {
                          header: `Run on ${this.state.creatingRunServiceServiceName}:`
                        },
                        createElement(
                          RunService, {
                            branch: branch,
                            serviceName: this.state.creatingRunServiceServiceName,
                            onRunService: (command) => {
                              this.doAction('RunService', {
                                branchId: branch.id,
                                serviceName: this.state.creatingRunServiceServiceName,
                                command: command
                              });

                              this.state[`branch${branch.id}Mode`] = null;
                              this.forceUpdate();
                            },
                            onCancel: () => {
                              this.state[`branch${branch.id}Mode`] = null;
                              this.forceUpdate();
                            }
                          }
                        )
                      )
                    ),
                    (!this.state[`branch${branch.id}Mode`] &&
                      createElement(
                        'div', {},
                        createElement(
                          Panel, {},
                          createElement(
                            ButtonToolbar, {},
                            createElement(
                              Button, {
                                bsStyle: 'primary',
                                onClick: () => {
                                  this.doAction('UpBranch', {
                                    id: branch.id
                                  });
                                }
                              },
                              'Up'
                            ),
                            createElement(
                              Button, {
                                bsStyle: 'info',
                                disabled: !branch.services,
                                onClick: () => {
                                  this.doAction('DownBranch', {
                                    id: branch.id
                                  });
                                }
                              },
                              'Down'
                            ),
                            createElement(
                              Button, {
                                bsStyle: 'default',
                                onClick: () => {
                                  this.setState({
                                    mappingPortBranchId: branch.id
                                  });
                                  this.state[`branch${branch.id}Mode`] = 'mappingPort';
                                  this.forceUpdate();
                                }
                              },
                              'Map port'
                            ),
                            createElement(
                              Button, {
                                bsStyle: 'danger',
                                onClick: () => {
                                  this.doAction('DeleteBranch', {
                                    id: branch.id
                                  });
                                }
                              },
                              'Delete'
                            )
                          )
                        ),
                        createElement(
                          Panel, {
                            header: 'Port mappings:'
                          },
                          createElement(
                            ButtonToolbar, {},
                            branch.portMappings.map(portMapping =>
                              createElement(
                                DropdownButton, {
                                  bsStyle: portMapping.active ? 'success' : 'warning',
                                  title: `${portMapping.protocol}: ${portMapping.publicPort} => ${portMapping.containerPort}@${portMapping.serviceName}`
                                },
                                createElement(
                                  MenuItem, {
                                    onClick: () => {
                                      this.doAction('DeletePortMapping', {
                                        branchId: branch.id,
                                        protocol: portMapping.protocol,
                                        publicPort: portMapping.publicPort
                                      });
                                    }
                                  },
                                  'Delete'
                                )
                              )
                            )
                          )
                        ),
                        (branch.services &&
                          createElement(
                            Panel, {
                              header: 'Services:'
                            },
                            createElement(
                              ButtonToolbar, {},
                              branch.services.map(service =>
                                createElement(
                                  DropdownButton, {
                                    title: service.name,
                                    key: service.name
                                  },
                                  createElement(
                                    MenuItem, {
                                      onClick: () => {
                                        this.state[`branch${branch.id}Mode`] = 'creatingRunService';
                                        this.setState({
                                          creatingRunServiceServiceName: service.name
                                        });
                                      }
                                    },
                                    'Run'
                                  ),
                                  createElement(
                                    MenuItem, {
                                      onClick: () => {
                                        this.doAction('LogService', {
                                          branchId: branch.id,
                                          serviceName: service.name
                                        });
                                      }
                                    },
                                    'Logs'
                                  )
                                )
                              )
                            )
                          )
                        ),
                        (branch.volumes &&
                          createElement(
                            Panel, {
                              header: 'Volumes:'
                            },
                            branch.volumes.map(volume =>
                              createElement(
                                DropdownButton, {
                                  title: volume.name,
                                  key: volume.name
                                },
                                createElement(
                                  MenuItem, {
                                    onClick: () => {
                                      this.doAction('ExportVolume', {
                                        branchId: branch.id,
                                        volumeName: volume.name
                                      });
                                    }
                                  },
                                  'Export'
                                ),
                                createElement(
                                  MenuItem, {
                                    onClick: () => {
                                      SelectFile('.tar', file => {
                                        this.doAction('ImportVolume', {
                                          branchId: branch.id,
                                          volumeName: volume.name
                                        });

                                        this.socket.send(file, {
                                          binary: true
                                        });
                                      });
                                    }
                                  },
                                  'Import'
                                )
                              )
                            )
                          )
                        )
                      )
                    )
                  )
                )
              )
            ),
            (!this.state.creatingBranch ?
              createElement(
                Button, {
                  onClick: () => {
                    this.setState({
                      creatingBranch: true
                    });
                  }
                },
                'New branch'
              ) :
              createElement(
                Panel, {
                  header: 'Creating new branch'
                },
                createElement(
                  NewBranch, {
                    onCancel: () => {
                      this.setState({
                        creatingBranch: false
                      });
                    },
                    onCreate: branchOptions => {
                      this.setState({
                        creatingBranch: false
                      });

                      this.doAction('CreateBranch', {
                        repo: branchOptions.repo,
                        branch: branchOptions.branch,
                        path: branchOptions.path,
                      });
                    }
                  }
                )
              )
            )
          )
        )
      )
    )
  }
}
