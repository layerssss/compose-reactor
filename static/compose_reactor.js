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
      this.socket = new WebSocket(location.href.replace(/^http/, 'ws'));

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
    var activeBranch = _.find(this.state.branches, b => b.id == this.state.activeBranchId);

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
            Row, {},
            createElement(
              Col, {
                md: 3
              },
              createElement(
                Nav, {
                  bsStyle: 'pills',
                  stacked: true
                },
                this.state.branches.map(branch =>
                  createElement(
                    NavItem, {
                      key: branch.id,
                      active: activeBranch == branch,
                      onClick: () => this.setState({
                        activeBranchId: branch.id,
                        creatingBranch: false
                      })
                    },
                    `${branch.repo}#${branch.branch}`,
                    createElement(
                      'br', {}
                    ),
                    `${branch.path}`
                  )
                )
              )
            ),
            createElement(
              Col, {
                md: 9
              },
              (activeBranch &&
                createElement(
                  Panel, {
                    key: activeBranch.id
                  },
                  createElement(
                    Panel, {
                      bsStyle: (activeBranch.terminal ?
                        'info' :
                        (activeBranch.services ? 'success' : 'warning')
                      ),
                      header: 'Status: ' + (activeBranch.terminal ?
                        'starting' :
                        (activeBranch.services ? 'running' : 'stopped')
                      )
                    },
                    createElement('p', {}, `ID: ${activeBranch.id}`),
                    createElement('p', {}, `Repository: ${activeBranch.repo}`),
                    createElement('p', {}, `Branch: ${activeBranch.branch}`),
                    createElement('p', {}, `Path: ${activeBranch.path}`),
                    createElement('p', {}, `Deployed at: ${activeBranch.deployedAt ? moment(activeBranch.deployedAt).format('LLL') : 'NaN'}`)
                  ),
                  (activeBranch.terminal ?
                    createElement(
                      XTerm, {
                        ref: `xTerm_${activeBranch.terminal.id}`,
                        title: activeBranch.terminal.title,
                        onResize: (cols, rows) => {
                          this.doAction('ResizeTerminal', {
                            id: activeBranch.terminal.id,
                            cols,
                            rows
                          });
                        },
                        onData: dataString => {
                          if (activeBranch.terminal.code) {
                            return this.doAction('DismissBranchTerminal', {
                              id: activeBranch.id,
                            });
                          }
                          this.doAction('InputTerminal', {
                            id: activeBranch.terminal.id,
                            dataString: dataString
                          });
                        }
                      }
                    ) :
                    createElement(
                      'div', {},
                      (this.state[`branch${activeBranch.id}Mode`] == 'mappingPort' &&
                        createElement(
                          Panel, {
                            header: 'Mapping port:'
                          },
                          createElement(
                            MappingPort, {
                              branch: activeBranch,
                              onMap: port => {
                                this.doAction('MapPort', _.merge(port, {
                                  branchId: activeBranch.id
                                }));

                                this.state[`branch${activeBranch.id}Mode`] = null;
                                this.forceUpdate();
                              },
                              onCancel: () => {
                                this.state[`branch${activeBranch.id}Mode`] = null;
                                this.forceUpdate();
                              }
                            }
                          )
                        )
                      ),
                      (this.state[`branch${activeBranch.id}Mode`] == 'creatingRunService' &&
                        createElement(
                          Panel, {
                            header: `Run on ${this.state.creatingRunServiceServiceName}:`
                          },
                          createElement(
                            RunService, {
                              branch: activeBranch,
                              serviceName: this.state.creatingRunServiceServiceName,
                              onRunService: (command) => {
                                this.doAction('RunService', {
                                  branchId: activeBranch.id,
                                  serviceName: this.state.creatingRunServiceServiceName,
                                  command: command
                                });

                                this.state[`branch${activeBranch.id}Mode`] = null;
                                this.forceUpdate();
                              },
                              onCancel: () => {
                                this.state[`branch${activeBranch.id}Mode`] = null;
                                this.forceUpdate();
                              }
                            }
                          )
                        )
                      ),
                      (!this.state[`branch${activeBranch.id}Mode`] &&
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
                                      id: activeBranch.id
                                    });
                                  }
                                },
                                'Up'
                              ),
                              createElement(
                                Button, {
                                  bsStyle: 'info',
                                  disabled: !activeBranch.services,
                                  onClick: () => {
                                    this.doAction('DownBranch', {
                                      id: activeBranch.id
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
                                      mappingPortBranchId: activeBranch.id
                                    });
                                    this.state[`branch${activeBranch.id}Mode`] = 'mappingPort';
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
                                      id: activeBranch.id
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
                              activeBranch.portMappings.map(portMapping =>
                                createElement(
                                  DropdownButton, {
                                    bsStyle: portMapping.active ? 'success' : 'warning',
                                    title: `${portMapping.protocol}: ${portMapping.publicPort} => ${portMapping.containerPort}@${portMapping.serviceName}`
                                  },
                                  createElement(
                                    MenuItem, {
                                      onClick: () => {
                                        this.doAction('DeletePortMapping', {
                                          branchId: activeBranch.id,
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
                          (activeBranch.services &&
                            createElement(
                              Panel, {
                                header: 'Services:'
                              },
                              createElement(
                                ButtonToolbar, {},
                                activeBranch.services.map(service =>
                                  createElement(
                                    DropdownButton, {
                                      title: service.name,
                                      key: service.name
                                    },
                                    createElement(
                                      MenuItem, {
                                        onClick: () => {
                                          this.state[`branch${activeBranch.id}Mode`] = 'creatingRunService';
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
                                            branchId: activeBranch.id,
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
                          (activeBranch.volumes &&
                            createElement(
                              Panel, {
                                header: 'Volumes:'
                              },
                              createElement(
                                ButtonToolbar, {},
                                activeBranch.volumes.map(volume =>
                                  createElement(
                                    DropdownButton, {
                                      title: volume.name,
                                      key: volume.name
                                    },
                                    createElement(
                                      MenuItem, {
                                        onClick: () => {
                                          this.doAction('ExportVolume', {
                                            branchId: activeBranch.id,
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
                                              branchId: activeBranch.id,
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
                )
              ),
              createElement(
                Panel, {
                  header: 'Creating new branch'
                },
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
                    NewBranch, {
                      onCancel: () => {
                        this.setState({
                          creatingBranch: false,
                          activeBranchId: null
                        });
                      },
                      onCreate: branchOptions => {
                        this.setState({
                          creatingBranch: false,
                          activeBranchId: null
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
    )
  }
}
