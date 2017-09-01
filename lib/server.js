var _ = require('lodash');
var Uuid = require('uuid');
var Pty = require('node-pty');
var Fs = require('fs');
var Net = require('net');
var Path = require('path');
var Rimraf = require('rimraf');
var ShellQuote = require('shell-quote');
var Utility = require('./utility.js');
var Yaml = require('js-yaml');
var StripAnsi = require('strip-ansi');

class Server {
  constructor(options) {
    this._options = options;
    this._sessions = [];
    this._branches = [];
    this._terminals = [];
    this._proxies = [];

    if (Fs.existsSync(this._options.stateFile)) {
      var applicationState = JSON.parse(Fs.readFileSync(
        options.stateFile, {
          encoding: 'utf8'
        }
      ));

      for (var branchOptions of applicationState.branches) {
        this._createBranch(branchOptions);
      }

      this._saveApplicationState();
    }
  }

  _createBranch(branchOptions) {
    branchOptions.portMappings = branchOptions.portMappings || [];
    branchOptions.id = branchOptions.id || Uuid.v4();
    branchOptions.path = branchOptions.path || '';

    this._branches.push(branchOptions);
    this._deployBranch(branchOptions);
  }

  _saveApplicationState() {
    Fs.writeFileSync(
      this._options.stateFile,
      JSON.stringify({
        branches: this._branches.map(branch => {
          return {
            repo: branch.repo,
            branch: branch.branch,
            portMappings: branch.portMappings,
            path: branch.path,
            id: branch.id
          };
        })
      }), {
        encoding: 'utf8'
      }
    );
  }

  _doActionImportVolume(parameters, session) {
    var branch = _.find(this._branches, b => b.id == parameters.branchId);
    if (!branch) return;

    var volumeDockerid = `composereactor${branch.id.replace(/-/g, '')}_${parameters.volumeName.replace(/[^\w]/g, '')}`;

    var workingPath;

    session.onMessage = (data) => {
      session.onMessage = null;
      Promise.resolve()
        .then(() => Utility.mkdtemp())
        .then(path => workingPath = path)
        .then(() => this._runTerminal(
          branch,
          `Cleaning volume ${volumeDockerid}...`,
          'docker', [
            'run',
            '--rm',
            '--volume', `${volumeDockerid}:/mnt/volume`,
            'ubuntu',
            'rm',
            '-Rf',
            '/mnt/volume/*'
          ],
          workingPath, {}
        ))
        .then(() => Utility.writeFile(Path.join(workingPath, 'data.tar'), data))
        .then(() => this._runTerminal(
          branch,
          `Importing volume ${volumeDockerid}...`,
          'docker', [
            'run',
            '--rm',
            '--volume', `${volumeDockerid}:/mnt/volume`,
            '--volume', `${workingPath}:/mnt/working`,
            'ubuntu',
            'tar',
            '-xvf',
            '/mnt/working/data.tar',
            '-C', '/mnt/volume',
          ],
          workingPath, {}
        ))
        .then(() => this._broadcastMessage('success', 'Successfully imported volume!'))
        .catch(error => this._broadcastError(error.message))
        .then(() => Utility.rimraf(workingPath));
    };
  }

  _doActionExportVolume(parameters, session) {
    var branch = _.find(this._branches, b => b.id == parameters.branchId);
    if (!branch) return;

    var volumeDockerid = `composereactor${branch.id.replace(/-/g, '')}_${parameters.volumeName.replace(/[^\w]/g, '')}`;

    var workingPath;
    return Promise.resolve()
      .then(() => Utility.mkdtemp())
      .then(path => workingPath = path)
      .then(() => this._runTerminal(
        branch,
        `Dumping volume ${volumeDockerid}...`,
        'docker', [
          'run',
          '--rm',
          '--volume', `${volumeDockerid}:/mnt/volume`,
          '--volume', `${workingPath}:/mnt/working`,
          'ubuntu',
          'tar',
          '-cvf',
          '/mnt/working/data.tar',
          '-C', '/mnt/volume',
          '.'
        ],
        workingPath, {}
      ))
      .then(() => Utility.readFile(Path.join(workingPath, 'data.tar')))
      .then((data) => {
        session.socket.send(JSON.stringify({
          file: {
            name: `${parameters.volumeName}.tar`,
          }
        }));

        session.socket.send(data);
      })
      .catch(error => this._broadcastError(error.message))
      .then(() => Utility.rimraf(workingPath));
  }

  _doActionLogService(parameters) {
    var branch = _.find(this._branches, b => b.id == parameters.branchId);
    if (!branch) return;

    this._checkoutBranch(branch, workingPath =>
      this._runTerminal(
        branch,
        `Viewing logs of ${parameters.serviceName}...`,
        'docker-compose', [
          'logs',
          '--follow',
          '--tail=all',
          parameters.serviceName
        ],
        workingPath, {}, {
          overrideCode: 1
        }
      )
    ).catch(error => this._broadcastError(error.message));
  }

  _doActionRunService(parameters) {
    var branch = _.find(this._branches, b => b.id == parameters.branchId);
    if (!branch) return;
    var args = ShellQuote.parse(parameters.command);

    this._checkoutBranch(branch, workingPath =>
      Promise.resolve().then(() =>
        _.find(args, arg => arg.op) && Promise.reject(new Error('Cannot contains shell operators.'))
      ).then(() =>
        this._runTerminal(
          branch,
          `Running ${parameters.command} on ${parameters.serviceName}...`,
          'docker-compose', [
            'run',
            parameters.serviceName,
            ...args
          ],
          workingPath, {}
        )
      )
    ).catch(error => this._broadcastError(error.message));
  }

  _doActionDismissBranchTerminal(parameters) {
    var branch = _.find(this._branches, b => b.id == parameters.id);
    if (!branch) return;
    if (!branch.terminal) return;
    if (!branch.terminal.code) return;

    branch.terminal = null;
    this._broadcastStates();
  }

  _doActionDeleteBranch(parameters) {
    var branch = _.find(this._branches, b => b.id == parameters.id);
    if (!branch) return;

    this._checkoutBranch(
        branch,
        workingPath => {
          return Promise.resolve()
            .then(() => this._runTerminal(
              branch,
              'Deleting the branch...',
              'docker-compose', [
                'down',
                '--remove-orphans',
                '--volumes'
              ],
              workingPath, {}
            ))
            .then(() => {
              branch.services = null;
              this._broadcastStates();

              this._rebuildProxies();
            });
        }
      )
      .catch(error => this._broadcastError(`Error checkout source code, delete anyway...: ${error.message}`))
      .then(() => {
        _.pull(this._branches, branch);
        this._saveApplicationState();
        this._broadcastStates();

        this._rebuildProxies();
      })
      .then(() => {
        this._broadcastMessage('success', 'Successfully removed.');
      }, error => {
        console.error(error.stack);
      });
  }

  _doActionCreateBranch(parameters, session) {
    this._createBranch({
      branch: parameters.branch,
      repo: parameters.repo,
      path: parameters.path,
      id: Uuid.v4()
    });

    this._saveApplicationState();
    this._broadcastStates();
  }

  _doActionDownBranch(parameters, session) {
    var branch = _.find(this._branches, b => b.id == parameters.id);
    if (!branch) return;

    this._checkoutBranch(
        branch,
        workingPath => {
          return Promise.resolve()
            .then(() => this._runTerminal(
              branch,
              'Stop the services...',
              'docker-compose', [
                'down',
                '--remove-orphans'
              ],
              workingPath, {}
            ))
            .then(() => {
              branch.services = null;
              branch.deployedAt = null;
              this._broadcastStates();

              this._rebuildProxies();
            });
        }
      )
      .then(() => {
        this._broadcastMessage('success', 'Successfully stopped.');
      }, error => {
        console.error(error.stack);
      });
  }

  _doActionUpBranch(parameters) {
    var branch = _.find(this._branches, b => b.id == parameters.id);
    if (!branch) return;

    this._deployBranch(branch);
  }

  _deployBranch(branch) {
    this._checkoutBranch(
        branch,
        workingPath => {
          branch.deployedAt = null;
          this._broadcastStates();

          return Promise.resolve()
            .then(() => this._runTerminal(
              branch,
              'Rebuilding the services...',
              'docker-compose', [
                'up',
                '--build',
                '-d',
                '--remove-orphans'
              ],
              workingPath, {}
            ))
            .then(() => this._runTerminal(
              branch,
              'Getting container information...',
              'docker-compose', [
                'config'
              ],
              workingPath, {}
            ))
            .then((data) => {
              data = Yaml.load(data);
              var volumes = [];
              for (var volumeName in data.volumes || {}) {
                volumes.push({
                  name: volumeName
                });
              }

              var services = [];
              for (var serviceName in data.services || {}) {
                services.push({
                  name: serviceName,
                  ports: data.services[serviceName].ports
                });
              }

              return Promise.all(services.map(service => {
                  return Promise.all((service.ports || []).map(port => {
                      var match = port.match(/(\d+)(\/(\w+))?$/);
                      if (!match) return Promise.resolve();

                      var containerPort = Number(match[1]);
                      var protocol = match[3] || 'tcp';
                      if (!protocol.match(/tcp|udp/)) return Promise.resolve();

                      return Promise.resolve()
                        .then(() => this._runTerminal(
                          branch,
                          `Getting ${containerPort}/${protocol} of ${service.name}...`,
                          'docker-compose', [
                            'port',
                            `--protocol=${protocol}`,
                            service.name,
                            containerPort
                          ], workingPath, {}
                        ))
                        .then(data => {
                          match = data.match(/:(\d+)$/);
                          if (!match) return;
                          var internalPort = Number(match[1]);

                          return {
                            containerPort,
                            protocol,
                            internalPort
                          };
                        });
                    }))
                    .then(ports => {
                      service.ports = _.compact(ports);
                    });
                }))
                .then(() => {
                  branch.services = services;
                  branch.volumes = volumes;
                  branch.deployedAt = Date.now();
                  this._broadcastStates();

                  this._rebuildProxies();
                });
            });
        }
      )
      .then(() => {
        this._broadcastMessage('success', 'Successfully deployed.');
      }, error => {
        console.error(error.stack);
        this._broadcastError(`Deploy failed: ${error.message}`);
      });
  }

  _checkoutBranch(branch, callback) {
    var branchPath;
    var repoPath = Path.join(
      process.env['HOME'] || process.cwd(),
      '.cache',
      'compose-reactor',
      `repo_${branch.id}`
    );

    return Promise.resolve()
      .then(() => Utility.mkdtemp())
      .then((path) => {
        branchPath = path;
      })
      .then(() => {
        if (Fs.existsSync(Path.join(repoPath, '.git'))) return;

        return Promise.resolve()
          .then(() => this._runTerminal(
            branch,
            'Cloning the repository...',
            'git', [
              'clone',
              branch.repo,
              '--branch',
              `${branch.branch}`,
              repoPath
            ],
            branchPath, {}
          ));
      })
      .then(() => this._runTerminal(
        branch,
        'Checkout the repo...',
        'git', [
          'fetch',
        ],
        repoPath, {}
      ))
      .then(() => this._runTerminal(
        branch,
        'Checkout the repo...',
        'git', [
          `--work-tree=${branchPath}`,
          'reset', '--hard',
          `origin/${branch.branch}`
        ],
        repoPath, {}
      ))
      .then(() => {
        var workingPath = branch.path ? Path.join(branchPath, branch.path) : branchPath;
        return callback(workingPath);
      })
      .then(() => Utility.rimraf(branchPath));
  }

  _sendTerminalOutput(id, dataString) {
    for (var session of this._sessions) {
      session.socket.send(JSON.stringify({
        terminalOutput: {
          id: id,
          dataString: dataString
        }
      }));
    }
  }

  _rebuildProxies() {
    var newProxies = [];
    this._branches.forEach(branch => {
      branch.portMappings.forEach(portMapping => {
        portMapping.active = false;
        if (portMapping.protocol != 'tcp') return;

        var service = _.find(branch.services, s => s.name == portMapping.serviceName);

        if (!service) return;

        var port = _.find(service.ports, p =>
          p.containerPort == portMapping.containerPort && p.protocol == portMapping.protocol);

        if (!port) return;

        var proxy = _.find(this._proxies, p =>
          p.publicPort == portMapping.publicPort);

        if (!proxy) {
          proxy = {
            publicPort: portMapping.publicPort,
            internalPort: port.internalPort
          };
        }

        if (proxy.internalPort != port.internalPort && proxy.server) {
          proxy.server.close();
          proxy.server = null;
        }

        if (proxy.server) {
          portMapping.active = true;
        } else {
          var server = Net.createServer(socket => {
            socket.on('error', error => console.error(error));

            var clientSocket = Net.connect({
              host: '127.0.0.1',
              port: port.internalPort
            });

            clientSocket.on('error', error => {
              socket.end();
              portMapping.active = false;
              this._broadcastStates();
            });

            clientSocket.on('connect', ()=> {
              portMapping.active = true;
              this._broadcastStates();
            });

            socket.pipe(clientSocket);
            clientSocket.pipe(socket);
          });

          server.on('error', error => {
            this._broadcastError(`Cannot initialize ${portMapping.protocol} port ${portMapping.containerPort} for ${portMapping.serviceName} of ${branch.repo}#${branch.branch}: ${error.message}`);
            _.pull(newProxies, proxy);
          });

          server.listen(portMapping.publicPort, () => {
            proxy.server = server;
            portMapping.active = true;
            this._broadcastStates();
          });
        }

        newProxies.push(proxy);
      });
    });

    for (var proxy of this._proxies) {
      if (-1 == newProxies.indexOf(proxy) && proxy.server) {
        proxy.server.close();
        proxy.server = null;
      }
    }

    this._proxies = newProxies;
    this._broadcastStates();
  }

  _doActionMapPort(parameters) {
    for (var existingBranch of this._branches) {
      var existingPort = _.find(existingBranch.portMappings, p =>
        p.publicPort == parameters.publicPort && p.protocol == parameters.protocol);

      if (existingPort) {
        return this._broadcastError(`${parameters.publicPort}/${parameters.protocol} has already been mapped to ${existingBranch.repo}#${existingBranch.branch}/${existingPort.serviceName}/${existingPort.containerPort}`);
      }
    }

    var branch = _.find(this._branches, b => b.id == parameters.branchId);
    if (!branch) return;


    branch.portMappings.push({
      serviceName: parameters.serviceName,
      protocol: parameters.protocol,
      containerPort: parameters.containerPort,
      publicPort: parameters.publicPort
    });

    this._broadcastStates();
    this._saveApplicationState();

    this._rebuildProxies();
  }

  _doActionDeletePortMapping(parameters) {
    var branch = _.find(this._branches, b => b.id == parameters.branchId);
    if (!branch) return;

    var portMapping = _.find(branch.portMappings, p =>
      p.protocol == parameters.protocol && p.publicPort == parameters.publicPort);
    if (!portMapping) return;

    _.pull(branch.portMappings, portMapping);
    this._broadcastStates();
    this._saveApplicationState();

    this._rebuildProxies();
  }

  _doActionResizeTerminal(parameters) {
    var terminal = _.find(this._terminals, t => t.id == parameters.id);

    if (!terminal) return;

    terminal.pty.resize(parameters.cols, parameters.rows);
  }

  _doActionInputTerminal(parameters) {
    var terminal = _.find(this._terminals, t => t.id == parameters.id);

    if (!terminal) return;
    terminal.pty.write(parameters.dataString);
  }

  _runTerminal(branch, title, command, args, workdir, env, options = {}) {
    var terminal;

    var defaultEnv = _.merge({}, process.env);
    delete defaultEnv['PORT'];
    defaultEnv['COMPOSE_PROJECT_NAME'] = `compose_reactor_${branch.id}`;

    var buffer = [];

    return Promise.resolve()
      .then(() => {
        terminal = {
          id: Uuid.v4(),
          pty: Pty.spawn(command, args, {
            name: 'xterm-color',
            cols: 80,
            rows: 30,
            cwd: workdir,
            env: _.defaults(defaultEnv, env)
          })
        };

        terminal.pty.on('data', data => {
          this._sendTerminalOutput(terminal.id, data);
          buffer.push(data);
        });

        this._terminals.push(terminal);
        branch.terminal = {
          id: terminal.id,
          title: title
        };

        this._broadcastStates();
        this._sendTerminalOutput(terminal.id, `${workdir} > ${command} ${args.map(a => `"${a}"`).join(' ')}\r\n`);
      })
      .then(() => new Promise((resolve, reject) => {
        terminal.pty.on('exit', code => {
          _.pull(this._terminals, terminal);

          code = code || options.overrideCode;

          if (code) {
            branch.terminal.code = code;
            this._broadcastStates();

            this._sendTerminalOutput(terminal.id, 'Press any key to dismiss...');

            return reject(new Error(`${command} exited with ${code}`));
          }

          branch.terminal = null;
          this._broadcastStates();

          resolve();
        });
      }))
      .then(() => _.trim(StripAnsi(buffer.join(''))));
  }

  _broadcastStates() {
    for (var session of this._sessions) {
      session.socket.send(JSON.stringify({
        state: session.state
      }));
    }
  }

  _broadcastError(message) {
    this._broadcastMessage('danger', message);
  }

  _broadcastMessage(type, message) {
    for (var session of this._sessions) {
      session.socket.send(JSON.stringify({
        message: {
          type,
          message
        }
      }));
    }
  }

  handleWebSocket(socket) {
    var state = {
      branches: this._branches
    };

    var session = {
      socket,
      state
    };

    var timer = setInterval(() => {
      this._broadcastStates();
    }, 10000);

    this._sessions.push(session);
    this._broadcastStates();

    socket.on('message', (data) => {
      if (session.onMessage) return session.onMessage(data);
      var action = JSON.parse(data);
      var actionFuncion = this['_doAction' + action.name];
      if (!actionFuncion) return this._broadcastError(action.name + ' doesn\'t exist.');
      actionFuncion.call(this, action.parameters, session);
    });

    socket.on('close', () => {
      _.pull(this._sessions, session);
      clearInterval(timer);

      this._broadcastStates();
    });

  }
}

module.exports = Server;
