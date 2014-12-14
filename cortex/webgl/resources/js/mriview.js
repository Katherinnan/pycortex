var mriview = (function(module) {
    var grid_shapes = [null, [1,1], [2, 1], [3, 1], [2, 2], [2, 2], [3, 2], [3, 2]];
    module.Viewer = function(figure) { 
        jsplot.Axes.call(this, figure);
        //Initialize all the html
        $(this.object).html($("#mriview_html").html())
        //Catalog the available colormaps
        $(this.object).find("#colormap option").each(function() {
            var im = new Image();
            im.src = $(this).data("imagesrc");
            var tex = new THREE.Texture(im);
            tex.minFilter = THREE.LinearFilter;
            tex.magFilter = THREE.LinearFilter;
            tex.premultiplyAlpha = true;
            tex.flipY = true;
            tex.needsUpdate = true;
            colormaps[$(this).text()] = tex;
        });
        this.canvas = $(this.object).find("#brain");
        jsplot.Axes3D.call(this, figure);

        this.surfs = [];
        this.dataviews = {};
        this.active = null;

        this.loaded = $.Deferred().done(function() {
            this.schedule();
            $(this.object).find("#ctmload").hide();
            this.canvas.css("opacity", 1);
        }.bind(this));

        this._bindUI();
    }
    module.Viewer.prototype = Object.create(jsplot.Axes3D.prototype);
    THREE.EventDispatcher.prototype.apply(module.Viewer.prototype);
    module.Viewer.prototype.constructor = module.Viewer;

    module.Viewer.prototype.drawView = function(scene, idx) {
        // if (this.surfs[idx].prerender)
        //     this.surfs[idx].prerender(idx, this.renderer, scene, this.camera);
        for (var i = 0; i < this.surfs.length; i++)
            this.surfs[i].apply(this.active);
        if (this.oculus)
            this.oculus.render(scene, this.camera);
        else
            this.renderer.render(scene, this.camera);
    }

    module.Viewer.prototype.setOculus = function() {
        if (this.oculus) {
            this.removeEventListener("resize", this.oculus._resize);
            delete this.oculus;
        } else {
            this.oculus = new THREE.OculusRiftEffect(this.renderer, {worldScale:1000});
            this.oculus._resize = function(evt) {
                this.oculus.setSize(evt.width, evt.height);
            }.bind(this);
            this.addEventListener("resize", this.oculus._resize);
            this.resize();
        }
        this.schedule();
    }

    module.Viewer.prototype.getState = function(state) {
        switch (state) {
            case 'mix':
                return $(this.object).find("#mix").slider("value");
            case 'pivot':
                return $(this.object).find("#pivot").slider("value");
            case 'frame':
                return this.frame;
            case 'azimuth':
                return this.controls.azimuth;
            case 'altitude':
                return this.controls.altitude;
            case 'radius':
                return this.controls.radius;
            case 'target':
                var t = this.controls.target;
                return [t.x, t.y, t.z];
            case 'depth':
                return this.uniforms.thickmix.value;
            case 'visL':
                return this.meshes.left.visible;
            case 'visR':
                return this.meshes.right.visible;
            case 'rotationL':
                var rot = this.meshes.left.rotation
                return [rot.x,rot.y,rot.z];
            case 'rotationR':
                var rot = this.meshes.right.rotation
                return [rot.x,rot.y,rot.z];
            case 'alpha':
                return this.renderer.getClearAlpha;
            case 'projection':
                if (this.camera.inOrthographicMode) {
                    return 'orthographic'}
                else if (this.camera.inPerspectiveMode) {
                    return 'perspective'}
            case 'slices':
                return [this.planes[0].slice, this.planes[1].slice, this.planes[2].slice]
        };
    };
    module.Viewer.prototype.setState = function(state, value) {
        switch (state) {
            case 'mix':
                return this.setMix(value);
            case 'pivot':
                return this.setPivot(value);
            case 'frame':
                this.setFrame(value);
                return this.figure.notify("setFrame", this, [value]);
            case 'azimuth':
                return this.controls.setCamera(value);
            case 'altitude':
                return this.controls.setCamera(undefined, value);
            case 'radius':
                return this.controls.setCamera(undefined, undefined, value);
            case 'target':
                if (this.roipack) this.roipack._updatemove = true;
                return this.controls.target.set(value[0], value[1], value[2]);
            case 'depth':
                return this.uniforms.thickmix.value = value;
            case 'visL':
                if (this.roipack) this.roipack._updatemove = true;
                return this.meshes.left.visible = value;
            case 'visR':
                if (this.roipack) this.roipack._updatemove = true;
                return this.meshes.right.visible = value;
            //case 'volume_vis':
            //    this.planes[0].mesh.visible = value[0]
            //    this.planes[1].mesh.visible = value[1]
            //    this.planes[2].mesh.visible = value[2]
            case 'rotationL':
                if (this.roipack) this.roipack._updatemove = true;
                return this.meshes.left.rotation.set(value[0], value[1], value[2]);
            case 'rotationR':
                if (this.roipack) this.roipack._updatemove = true;
                return this.meshes.right.rotation.set(value[0], value[1], value[2]);
            case 'alpha':
                return this.renderer.setClearColor(0,value);
            case 'specularity':
                return this.specularity = value
            case 'data':
                return this.setData(value)
            case 'labels':
                return this.labelshow = value;
            case 'pivot':
                return 'SORRY NOT YET'
            case 'projection':
                if (value=='perspective'){
                    return this.controls.camera.toPerspective()}
                else if (value=='orthographic'){
                    return this.controls.camera.toOrthographic()}
            case 'slices':
                return [this.planes[0].update(value[0]), this.planes[1].update(value[1]), this.planes[2].update(value[2])];
        };
    };
    
    module.Viewer.prototype.animate = function(animation) {
        var state = {};
        var anim = [];
        animation.sort(function(a, b) { return a.idx - b.idx});
        for (var i = 0, il = animation.length; i < il; i++) {
            var f = animation[i];
            if (f.idx == 0) {
                this.setState(f.state, f.value);
                state[f.state] = {idx:0, val:f.value};
            } else {
                if (state[f.state] === undefined)
                    state[f.state] = {idx:0, val:this.getState(f.state)};
                var start = {idx:state[f.state].idx, state:f.state, value:state[f.state].val}
                var end = {idx:f.idx, state:f.state, value:f.value};
                state[f.state].idx = f.idx;
                state[f.state].val = f.value;
                if (start.value instanceof Array) {
                    var test = true;
                    for (var j = 0; test && j < start.value.length; j++)
                        test = test && (start.value[j] == end.value[j]);
                    if (!test)
                        anim.push({start:start, end:end, ended:false});
                } else if (start.value != end.value)
                    anim.push({start:start, end:end, ended:false});
            }
        }
        if (this.active.fastshader) {
            this.meshes.left.material = this.active.fastshader;
            this.meshes.right.material = this.active.fastshader;
        }
        this._animation = {anim:anim, start:new Date()};
        this.schedule();
    };
    module.Viewer.prototype._animate = function(sec) {
        var state = false;
        var idx, val, f, i, j;
        for (i = 0, il = this._animation.anim.length; i < il; i++) {
            f = this._animation.anim[i];
            if (!f.ended) {
                if (f.start.idx <= sec && sec < f.end.idx) {
                    idx = (sec - f.start.idx) / (f.end.idx - f.start.idx);
                    if (f.start.value instanceof Array) {
                        val = [];
                        for (j = 0; j < f.start.value.length; j++) {
                            //val.push(f.start.value[j]*(1-idx) + f.end.value[j]*idx);
                            val.push(this._animInterp(f.start.state, f.start.value[j], f.end.value[j], idx));
                        }
                    } else {
                        //val = f.start.value * (1-idx) + f.end.value * idx;
                        val = this._animInterp(f.start.state, f.start.value, f.end.value, idx);
                    }
                    this.setState(f.start.state, val);
                    state = true;
                } else if (sec >= f.end.idx) {
                    this.setState(f.end.state, f.end.value);
                    f.ended = true;
                } else if (sec < f.start.idx) {
                    state = true;
                }
            }
        }
        return state;
    };
    module.Viewer.prototype._animInterp = function(state, startval, endval, idx) {
        switch (state) {
            case 'azimuth':
                // Azimuth is an angle, so we need to choose which direction to interpolate
                if (Math.abs(endval - startval) >= 180) { // wrap
                    if (startval > endval) {
                        return (startval * (1-idx) + (endval+360) * idx + 360) % 360;
                    }
                    else {
                        return (startval * (1-idx) + (endval-360) * idx + 360) % 360;
                    }
                } 
                else {
                    return (startval * (1-idx) + endval * idx);
                }
            default:
                // Everything else can be linearly interpolated
                return startval * (1-idx) + endval * idx;
        }
    };

    module.Viewer.prototype.reset_view = function(center, height) {
        var asp = this.flatlims[1][0] / this.flatlims[1][1];
        var camasp = height !== undefined ? asp : this.camera.cameraP.aspect;
        var size = [module.flatscale*this.flatlims[1][0], module.flatscale*this.flatlims[1][1]];
        var min = [module.flatscale*this.flatlims[0][0], module.flatscale*this.flatlims[0][1]];
        var xoff = center ? 0 : size[0] / 2 - min[0];
        var zoff = center ? 0 : size[1] / 2 - min[1];
        var h = size[0] / 2 / camasp;
        h /= Math.tan(this.camera.fov / 2 * Math.PI / 180);
        this.controls.target.set(xoff, this.flatoff[1], zoff);
        this.controls.setCamera(180, 90, h);
        this.setMix(1);
        this.setShift(0);
    };
    // module.Viewer.prototype.update_volvis = function() {
    //     for (var i = 0; i < 3; i++) {
    //         this.planes[i].update();
    //         this.planes[i].mesh.visible = $("#volvis").prop("checked");
    //     }
    //     this.schedule();
    // };
    // module.Viewer.prototype.update_leftvis = function() {
    //     this.meshes.left.visible = $("#leftvis").prop("checked");
    //     this.schedule();
    // };
    // module.Viewer.prototype.update_rightvis = function() {
    //     this.meshes.right.visible = $("#rightvis").prop("checked");
    //     this.schedule();
    // };
    module.Viewer.prototype.update_projection = function() {
        if ($("#projpersp").prop("checked")) {
            this.setState("projection", "perspective");
        } else {
            this.setState("projection", "orthographic");
        }
        this.schedule();
    };
    // module.Viewer.prototype.saveflat = function(height, posturl) {
    //     var width = height * this.flatlims[1][0] / this.flatlims[1][1];;
    //     var roistate = $(this.object).find("#roishow").attr("checked");
    //     this.screenshot(width, height, function() { 
    //         this.reset_view(false, height); 
    //         $(this.object).find("#roishow").attr("checked", false);
    //         $(this.object).find("#roishow").change();
    //     }.bind(this), function(png) {
    //         $(this.object).find("#roishow").attr("checked", roistate);
    //         $(this.object).find("#roishow").change();
    //         this.controls.target.set(0,0,0);
    //         this.roipack.saveSVG(png, posturl);
    //     }.bind(this));
    // }; 
    // module.Viewer.prototype.setMix = function(val) {
    //     var num = this.meshes.left.geometry.morphTargets.length;
    //     var flat = num - 1;
    //     var n1 = Math.floor(val * num)-1;
    //     var n2 = Math.ceil(val * num)-1;

    //     for (var h in this.meshes) {
    //         var hemi = this.meshes[h];
    //         if (hemi !== undefined) {
    //             for (var i=0; i < num; i++) {
    //                 hemi.morphTargetInfluences[i] = 0;
    //             }

    //             if (this.flatlims !== undefined)
    //                 this.uniforms.hide_mwall.value = (n2 == flat);

    //             hemi.morphTargetInfluences[n2] = (val * num)%1;
    //             if (n1 >= 0)
    //                 hemi.morphTargetInfluences[n1] = 1 - (val * num)%1;
    //         }
    //     }
    //     if (this.flatlims !== undefined) {
    //         this.flatmix = n2 == flat ? (val*num-.000001)%1 : 0;
    //         this.setPivot(this._pivot);
    //         this.update_spec();
    //         if (n2 == flat) {
    //             for (var i = 0; i < 3; i++) {
    //                 this.planes[i].update();
    //                 this.planes[i].mesh.visible = false;
    //             }
    //             $("#volvis").attr("disabled", true);
    //         } else {
    //             $("#volvis").removeAttr("disabled");
    //             this.update_volvis();
    //         }
    //     }
    //     $(this.object).find("#mix").slider("value", val);
        
    //     this.dispatchEvent({type:"mix", flat:this.flatmix, mix:val});
    //     this.figure.notify("setmix", this, [val]);
    //     this.schedule();
    // }; 
    // module.Viewer.prototype.setPivot = function (val, fromuser) {
    //     this._pivot = val;
    //     val = this.flatmix * 180 + (1-this.flatmix) * this._pivot;
    //     $(this.object).find("#pivot").slider("option", "value", val);
    //     var names = {left:1, right:-1};
    //     var frac = Math.abs(val/180) * (1-this.flatmix);
    //     if (val > 0) {
    //         for (var name in names) {
    //             this.pivot[name].front.rotation.z = 0;
    //             this.pivot[name].back.rotation.z = val*Math.PI/180 * names[name]/ 2;
    //             // Move hemispheres so that focus stays at center
    //             this.pivot[name].back.position.y = frac * this.meshes.right.geometry.boundingBox.min.y + ((1-frac) * this.pivot[name].back.orig_position.y);

    //         }
    //     } else {
    //         for (var name in names) {
    //             this.pivot[name].back.rotation.z = 0;
    //             // Make sure back position is reset before front pivoting
    //             this.pivot[name].back.position.y = this.pivot[name].back.orig_position.y;
    //             this.pivot[name].front.rotation.z = val*Math.PI/180 * names[name] / 2;

    //             // Move hemispheres so that focus stays at center
    //             this.pivot[name].front.position.y = frac * (this.meshes.right.geometry.boundingBox.max.y - this.pivot[name].front.orig_position.y) + ((1-frac) * this.pivot[name].front.orig_position.y);
    //         }
    //     }
    //     this.figure.notify("setpivot", this, [val]);
    //     this.schedule();
    // };
    // module.Viewer.prototype.setShift = function(val) {
    //     this.pivot.left.front.position.x = -val;
    //     this.pivot.right.front.position.x = val;
    //     this.figure.notify('setshift', this, [val]);
    //     this.schedule();
    // };
    // module.Viewer.prototype.update_spec = function() {
    //     var s = this.specular * (1 - this.flatmix);
    //     this.uniforms.specular.value.set(s, s, s);
    // };

    module.Viewer.prototype.addData = function(data) {
        if (!(data instanceof Array))
            data = [data];

        var name, view;

        var handle = "<div class='handle'><span class='ui-icon ui-icon-carat-2-n-s'></span></div>";
        for (var i = 0; i < data.length; i++) {
            view = data[i];
            name = view.name;
            this.dataviews[name] = view;

            var found = false;
            $(this.object).find("#datasets li").each(function() {
                found = found || ($(this).text() == name);
            })
            if (!found)
                $(this.object).find("#datasets").append("<li class='ui-corner-all'>"+handle+name+"</li>");
        }
        
        this.setData(data[0].name);
    };

    module.Viewer.prototype.setData = function(name) {
        if (name instanceof Array) {
            if (name.length == 1) {
                name = name[0];
            } else if (name.length == 2) {
                var dv1 = this.dataviews[name[0]];
                var dv2 = this.dataviews[name[1]];
                //Can't create 2D data view when the view is already 2D!
                if (dv1.data.length > 1 || dv2.data.length > 1)
                    return false;
                //Can't create mixed volume/vertex renderer
                if (!(dv1.vertex ^ dv.vertex))
                    return false;

                return this.addData(dataset.makeFrom(dv1, dv2));
            } else {
                return false;
            }
        }

        //unbind the shader update event from the existing surfaces
        for (var i = 0; i < this.surfs.length; i++) {
            this.active.removeEventListener("update", this.surfs[i]._update);
            this.active.removeEventListener("attribute", this.surfs[i]._attrib);
        }
        //set the new active data and update shaders for all surfaces
        this.active = this.dataviews[name];
        if (this.surfs.length < 1) {
            var surf = this.addSurf(module.SurfDelegate);
        } else {
            if (this.active.vertex) {
                if (this.surfs.length > 1)
                for (var i = 0; i < this.surfs.length; i++) {

                }//delete all other surfaces, since vertex is tightly coupled to surface
            }
            for (var i = 0; i < this.surfs.length; i++) {
                this.surfs[i].update(this.active);
                this.active.addEventListener("update", this.surfs[i]._update);
                this.active.addEventListener("attribute", this.surfs[i]._attrib);
            }
        }
        this.active.loaded.done(function() { this.active.set(); }.bind(this));

        var surf, scene, grid = grid_shapes[this.active.data.length];
        //cleanup old scene grid for the multiview
        // for (var i = 0; i < this.views.length; i++) {
        //     this.views[i].scene.dispose();
        // }
        //Generate new scenes and re-add the surface objects
        for (var i = 0; i < this.active.data.length; i++) {
            scene = this.setGrid(grid[0], grid[1], i);
        }

        //Show or hide the colormap for raw / non-raw dataviews
        if (this.active.data[0].raw) {
            $("#color_fieldset").fadeTo(0.15, 0);
        } else {
            $("#color_fieldset").fadeTo(0.15, 1);
        }

        var defers = [];
        for (var i = 0; i < this.active.data.length; i++) {
            defers.push(subjects[this.active.data[i].subject].loaded)
        }
        $.when.apply(null, defers).done(function() {
            //unhide the main canvas object
            this.canvas[0].style.opacity = 1;

            $(this.object).find("#vrange").slider("option", {min: this.active.data[0].min, max:this.active.data[0].max});
            if (this.active.data.length > 1) {
                $(this.object).find("#vrange2").slider("option", {min: this.active.data[1].min, max:this.active.data[1].max});
                $(this.object).find("#vminmax2").show();
            } else {
                $(this.object).find("#vminmax2").hide();
                this.setVminmax(this.active.vmin[0].value[0], this.active.vmax[0].value[0], 0);
            }

            this.setupStim();
            
            $(this.object).find("#datasets li").each(function() {
                if ($(this).text() == name)
                    $(this).addClass("ui-selected");
                else
                    $(this).removeClass("ui-selected");
            })

            $(this.object).find("#datasets").val(name);
            if (typeof(this.active.description) == "string") {
                var html = name+"<div class='datadesc'>"+this.active.description+"</div>";
                $(this.object).find("#dataname").html(html).show();
            } else {
                $(this.object).find("#dataname").text(name).show();
            }
            this.schedule();
        }.bind(this));
    };
    module.Viewer.prototype.nextData = function(dir) {
        var i = 0, found = false;
        var datasets = [];
        $(this.object).find("#datasets li").each(function() {
            if (!found) {
                if (this.className.indexOf("ui-selected") > 0)
                    found = true;
                else
                    i++;
            }
            datasets.push($(this).text())
        });
        if (dir === undefined)
            dir = 1

        this.setData([datasets[(i+dir).mod(datasets.length)]]);
    };
    module.Viewer.prototype.rmData = function(name) {
        delete this.datasets[name];
        $(this.object).find("#datasets li").each(function() {
            if ($(this).text() == name)
                $(this).remove();
        })
    };
    module.Viewer.prototype.addSurf = function(surftype, opts) {
        //Sets the slicing surface used to visualize the data
        var surf = new surftype(this.active, opts);
        surf.addEventListener("mix", function(evt){
            this.controls.update(evt.flat);
        }.bind(this));

        this.surfs.push(surf);
        this.root.add(surf.object);

        this.active.addEventListener("update", surf._update);
        this.active.addEventListener("attribute", surf._attrib);
        this.schedule();
        return surf;
    };
    module.Viewer.prototype.rmSurf = function(surftype) {
        for (var i = 0; i < this.surfs.length; i++) {
            if (this.surfs[i].constructor == surftype) {
                this.active.removeEventListener("update", this.surfs[i]._update);
                this.active.removeEventListener("attribute", this.surfs[i]._attrib);

                this.root.remove(this.surfs[i].object);
            }
        }
        this.schedule();
    }

    module.Viewer.prototype.setupStim = function() {
        if (this.active.data[0].movie) {
            $(this.object).find("#moviecontrols").show();
            $(this.object).find("#bottombar").addClass("bbar_controls");
            $(this.object).find("#movieprogress>div").slider("option", {min:0, max:this.active.length});
            this.active.data[0].loaded.progress(function(idx) {
                var pct = idx / this.active.frames * 100;
                $(this.object).find("#movieprogress div.ui-slider-range").width(pct+"%");
            }.bind(this)).done(function() {
                $(this.object).find("#movieprogress div.ui-slider-range").width("100%");
            }.bind(this));
            
            this.active.loaded.done(function() {
                this.setFrame(0);
            }.bind(this));

            if (this.active.stim && figure) {
                figure.setSize("right", "30%");
                this.movie = figure.add(jsplot.MovieAxes, "right", false, this.active.stim);
                this.movie.setFrame(0);
            }
        } else {
            $(this.object).find("#moviecontrols").hide();
            $(this.object).find("#bottombar").removeClass("bbar_controls");
        }
        this.schedule();
    };
    module.Viewer.prototype.setMix = function(mix) {
        for (var i = 0; i < this.surfs.length; i++) {
            if (this.surfs[i].setMix instanceof Function)
                this.surfs[i].setMix(mix);
        }
        $(this.object).find("#mix").slider("value", mix);
        this.schedule();
    };
    module.Viewer.prototype.setPivot = function(pivot) {
        for (var i = 0; i < this.surfs.length; i++) {
            if (this.surfs[i].setPivot instanceof Function)
                this.surfs[i].setPivot(pivot);
        }
        $(this.object).find("#pivot").slider("value", pivot);
        this.schedule();
    }

    module.Viewer.prototype.setVminmax = function(vmin, vmax, dim) {
        if (dim === undefined)
            dim = 0;
        var range, min, max;
        if (dim == 0) {
            range = "#vrange"; min = "#vmin"; max = "#vmax";
        } else {
            range = "#vrange2"; min = "#vmin2"; max = "#vmax2";
        }

        if (vmax > $(this.object).find(range).slider("option", "max")) {
            $(this.object).find(range).slider("option", "max", vmax);
            this.active.data[dim].max = vmax;
        } else if (vmin < $(this.object).find(range).slider("option", "min")) {
            $(this.object).find(range).slider("option", "min", vmin);
            this.active.data[dim].min = vmin;
        }
        $(this.object).find(range).slider("values", [vmin, vmax]);
        $(this.object).find(min).val(vmin);
        $(this.object).find(max).val(vmax);

        this.active.setVminmax(vmin, vmax, dim);

        this.schedule();
    };

    module.Viewer.prototype.startCmapSearch = function() {
        var sr = $(this.object).find("#cmapsearchresults"),
        cm = $(this.object).find("#colormap"),
        sb = $(this.object).find("#cmapsearchbox"),
        v = this;

        sb.val("");
        sb.css("width", cm.css("width"));
        sb.css("height", cm.css("height"));
        sr.show();
        sb.keyup(function(e) {
            if (e.keyCode == 13) { // enter
                try {this.setColormap($(sr[0]).find(".selected_sr input")[0].value);}
                finally {this.stopCmapSearch();}
            } if (e.keyCode == 27) { // escape
                this.stopCmapSearch();
            }
            var value = sb[0].value.trim();
            sr.empty();
            if (value.length > 0) {
                for (var k in this.cmapnames) {
                    if (k.indexOf(value) > -1) {
                        sr.append($($(this.object).find("#colormap li")[this.cmapnames[k]]).clone());
                    }
                }
                $(sr[0].firstChild).addClass("selected_sr");
                sr.children().mousedown(function() {
                    try {v.setColormap($(this).find("input")[0].value);}
                    finally {v.stopCmapSearch();}
                });
            }
        }.bind(this)).show();
        sb.focus();
        sb.blur(function() {this.stopCmapSearch();}.bind(this));
    };

    module.Viewer.prototype.stopCmapSearch = function() {
        var sr = $(this.object).find("#cmapsearchresults"),
        sb = $(this.object).find("#cmapsearchbox");
        sr.hide().empty();
        sb.hide();
    };

    module.Viewer.prototype.setFrame = function(frame) {
        if (frame > this.active.length) {
            frame -= this.active.length;
            this._startplay += this.active.length;
        }

        this.frame = frame;
        this.active.setFrame(this.uniforms, frame);
        $(this.object).find("#movieprogress div").slider("value", frame);
        $(this.object).find("#movieframe").attr("value", frame);
        this.schedule();
    };

    module.Viewer.prototype.getImage = function(width, height, post) {
        if (width === undefined)
            width = this.canvas.width();
        
        if (height === undefined)
            height = width * this.canvas.height() / this.canvas.width();

        console.log(width, height);
        var renderbuf = new THREE.WebGLRenderTarget(width, height, {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            format:THREE.RGBAFormat,
            stencilBuffer:false,
        });

        var clearAlpha = this.renderer.getClearAlpha();
        var clearColor = this.renderer.getClearColor();
        var oldw = this.canvas.width(), oldh = this.canvas.height();
        this.camera.setSize(width, height);
        this.camera.updateProjectionMatrix();
        this.controls._zoom(1.0) // To assure orthographic zoom is set correctly
        //this.renderer.setSize(width, height);
        this.renderer.setClearColor(new THREE.Color(0,0,0), 0);
        this.renderer.render(this.scene, this.camera, renderbuf);
        //this.renderer.setSize(oldw, oldh);
        this.renderer.setClearColor(new THREE.Color(0,0,0), 1);
        this.camera.setSize(oldw, oldh);
        this.camera.updateProjectionMatrix();

        var img = mriview.getTexture(this.renderer.context, renderbuf)
        if (post !== undefined)
            $.post(post, {png:img.toDataURL()});
        return img;
    };

    var _bound = false;
    module.Viewer.prototype._bindUI = function() {
        $(window).scrollTop(0);
        $(window).resize(function() { this.resize(); }.bind(this));
        this.canvas.resize(function() { this.resize(); }.bind(this));
        //These are events that should only happen once, regardless of multiple views
        if (!_bound) {
            _bound = true;
            window.addEventListener( 'keydown', function(e) {
                btnspeed = 0.5;
                if (e.target.tagName == "INPUT" && e.target.type == "text")
                    return;
                if (e.keyCode == 32) {         //space
                    if (this.active.data[0].movie)
                        this.playpause();
                    e.preventDefault();
                    e.stopPropagation();
                } else if (e.keyCode == 82) { //r
                    this.animate([{idx:btnspeed, state:"target", value:[0,0,0]},
                                  {idx:btnspeed, state:"mix", value:0.0}]);
                } else if (e.keyCode == 73) { //i
                    this.animate([{idx:btnspeed, state:"mix", value:0.5}]);
                } else if (e.keyCode == 70) { //f
                    this.animate([{idx:btnspeed, state:"target", value:[0,0,0]},
                                  {idx:btnspeed, state:"mix", value:1.0}]);
                } else if (e.keyCode == 37) { //left
		    this.animate([{idx:btnspeed, state:"azimuth", value:(Math.floor(this.getState("azimuth")/90)+1)*90.5}]);
		} else if (e.keyCode == 39) { //right
		    this.animate([{idx:btnspeed, state:"azimuth", value:(Math.floor(this.getState("azimuth")/90)-1)*90.5}]);
		} else if (e.keyCode == 38) { //up
		    this.animate([{idx:btnspeed, state:"altitude", value:(Math.round(this.getState("altitude")/90)-1)*90.5}]);
		} else if (e.keyCode == 40) { //down
		    this.animate([{idx:btnspeed, state:"altitude", value:(Math.round(this.getState("altitude")/90)+1)*90.5}]);
		}
            }.bind(this));
        }
        window.addEventListener( 'keydown', function(e) {
            if (e.target.tagName == "INPUT" && e.target.type == "text")
                return;
            if (e.keyCode == 107 || e.keyCode == 187) { //+
                this.nextData(1);
            } else if (e.keyCode == 109 || e.keyCode == 189) { //-
                this.nextData(-1);
            } else if (e.keyCode == 68) { //d
                if (this.uniforms.dataAlpha.value < 1)
                    this.uniforms.dataAlpha.value = 1;
                else
                    this.uniforms.dataAlpha.value = 0;
                this.schedule();
            } else if (e.keyCode == 76) { //l
                var box = $(this.object).find("#labelshow");
                box.attr("checked", box.attr("checked") == "checked" ? null : "checked");
                this.labelshow = !this.labelshow;
                this.schedule();
                e.stopPropagation();
                e.preventDefault();
            } else if (e.keyCode == 81) { //q
                this.planes[0].next();
            } else if (e.keyCode == 87) { //w
                this.planes[0].prev();
            } else if (e.keyCode == 65) { //a
                this.planes[1].next();
            } else if (e.keyCode == 83) { //s
                this.planes[1].prev();
            } else if (e.keyCode == 90) { //z
                this.planes[2].next();
            } else if (e.keyCode == 88) { //x
                this.planes[2].prev();
            }
        }.bind(this));
        var _this = this;
        $(this.object).find("#mix").slider({
            min:0, max:1, step:.001,
            slide: function(event, ui) { this.setMix(ui.value); }.bind(this)
        });
        $(this.object).find("#pivot").slider({
            min:-180, max:180, step:.01,
            slide: function(event, ui) { this.setPivot(ui.value); }.bind(this)
        });

        $(this.object).find("#shifthemis").slider({
            min:0, max:100, step:.01,
            slide: function(event, ui) { this.setShift(ui.value); }.bind(this)
        });

        if ($(this.object).find("#color_fieldset").length > 0) {
            $(this.object).find("#colormap").ddslick({ width:296, height:350, 
                onSelected: function() { 
                    var name = $(this.object).find("#colormap .dd-selected-text").text();
                    if (this.active) {
                        this.active.setColormap(name);
                        this.schedule();
                    }
                }.bind(this)
            });
            $(this.object).find("#cmapsearch").click(function() {
                this.startCmapSearch();
            }.bind(this));

            $(this.object).find("#vrange").slider({ 
                range:true, width:200, min:0, max:1, step:.001, values:[0,1],
                slide: function(event, ui) { 
                    $(this.object).find("#vmin").val(ui.values[0]);
                    $(this.object).find("#vmax").val(ui.values[1]);
                    this.active.setVminmax(ui.values[0], ui.values[1]);
                    this.schedule();
                }.bind(this)
            });
            $(this.object).find("#vmin").change(function() { 
                this.active.setVminmax(
                    parseFloat($(this.object).find("#vmin").val()), 
                    parseFloat($(this.object).find("#vmax").val())
                ); 
                this.schedule();
            }.bind(this));
            $(this.object).find("#vmax").change(function() { 
                this.active.setVminmax(
                    parseFloat($(this.object).find("#vmin").val()), 
                    parseFloat($(this.object).find("#vmax").val())
                    ); 
                this.schedule();
            }.bind(this));

            $(this.object).find("#vrange2").slider({ 
                range:true, width:200, min:0, max:1, step:.001, values:[0,1], orientation:"vertical",
                slide: function(event, ui) { 
                    $(this.object).find("#vmin2").value(ui.values[0]);
                    $(this.object).find("#vmax2").value(ui.values[1]);
                    this.active.setVminmax(ui.values[0], ui.values[1], 1);
                    this.schedule();
                }.bind(this)
            });
            $(this.object).find("#vmin2").change(function() { 
                this.active.setVminmax(
                    parseFloat($(this.object).find("#vmin2").val()), 
                    parseFloat($(this.object).find("#vmax2").val()),
                    1);
                this.schedule();
            }.bind(this));
            $(this.object).find("#vmax2").change(function() { 
                this.active.setVminmax(
                    parseFloat($(this.object).find("#vmin2").val()), 
                    parseFloat($(this.object).find("#vmax2").val()), 
                    1); 
                this.schedule();
            }.bind(this));            
        }
        /*
        // Setup controls for multiple overlays
        var updateOverlays = function() {
            this.roipack.update(this.renderer).done(function(tex){
                this.uniforms.map.texture = tex;
                this.schedule();
            }.bind(this));
        }.bind(this);

        for (var li=0; li<disp_layers.length; li++) {
            var layername = disp_layers[li];

            $(this.object).find("#"+layername+"_linewidth").slider({
                min:.5, max:10, step:.1, 
		value: disp_defaults[layername]['line_width'],
                change: updateOverlays,
            });
            $(this.object).find("#"+layername+"_linealpha").slider({
                min:0, max:1, step:.001, 
		value: disp_defaults[layername]['line_alpha'],
                change: updateOverlays,
            });
            $(this.object).find("#"+layername+"_fillalpha").slider({
                min:0, max:1, step:.001, 
		value: disp_defaults[layername]['fill_alpha'],
                change: updateOverlays,
            });
            $(this.object).find("#"+layername+"_shadowalpha").slider({
                min:0, max:20, step:1, value:4,
                change: updateOverlays,
            });
            $(this.object).find("#"+layername+"_linecolor").minicolors({
		change: updateOverlays,
		defaultValue: disp_defaults[layername]['line_color']
	    });
            $(this.object).find("#"+layername+"_fillcolor").minicolors({
		change: updateOverlays,
		defaultValue: disp_defaults[layername]['fill_color']
	    });
            $(this.object).find("#"+layername+"_shadowcolor").minicolors({change: updateOverlays});

            var _this = this;
            $(this.object).find("#"+layername+"show").change(function() {
                console.log("Toggling: " + "#"+$(this).attr("layername"));
                var el = $(_this.roipack.svgroi).find("#"+$(this).attr("layername"));
                if (this.checked)
                    el.css('display','inline');
                else
                    el.css('display','none');

                updateOverlays();
            }).attr("layername", layername);

            $(this.object).find("#"+layername+"labelshow").change(function() {
                // this.labelshow = !this.labelshow;
                _this.roipack.layer_label_visibility[$(this).attr("layername")] = this.checked;
                _this.roipack.update_labels();
                _this.roipack.labels.setMix(_this.flatmix);
                _this.schedule();
            }).attr("layername", layername);
        }
        $(this.object).find("#overlay_fieldset").tabs();

        $(this.object).find("#layer_curvalpha").slider({ min:0, max:1, step:.001, value:1, slide:function(event, ui) {
            this.uniforms.curvAlpha.value = ui.value;
            this.schedule();
        }.bind(this)})
        $(this.object).find("#layer_curvmult").slider({ min:.001, max:2, step:.001, value:1, slide:function(event, ui) {
            this.uniforms.curvScale.value = ui.value;
            this.schedule();
        }.bind(this)})
        $(this.object).find("#layer_curvlim").slider({ min:0, max:.5, step:.001, value:.2, slide:function(event, ui) {
            this.uniforms.curvLim.value = ui.value;
            this.schedule();
        }.bind(this)})
        $(this.object).find("#layer_dataalpha").slider({ min:0, max:1, step:.001, value:1.0, slide:function(event, ui) {
            this.uniforms.dataAlpha.value = ui.value;
            this.schedule();
        }.bind(this)})
        $(this.object).find("#layer_specularity").slider({ min:0, max:1, step:.001, value:this.specular, slide:function(event, ui) {
            this.specular = ui.value;
            this.update_spec();
            this.schedule();
        }.bind(this)})
        $(this.object).find("#layer_hatchalpha").slider({ min:0, max:1, step:.001, value:1, slide:function(event, ui) {
            this.uniforms.hatchAlpha.value = ui.value;
            this.schedule();
        }.bind(this)})
        $(this.object).find("#layer_hatchcolor").minicolors({close: function(hex, rgb) {
            this.uniforms.hatchColor.value.set(rgb.r / 255, rgb.g / 255, rgb.b / 255);
            this.schedule();
        }.bind(this)});

        $(this.object).find("#volvis").change(this.update_volvis.bind(this));
        $(this.object).find("#leftvis").change(this.update_leftvis.bind(this));
        $(this.object).find("#rightvis").change(this.update_rightvis.bind(this));
        $(this.object).find("#projpersp").change(this.update_projection.bind(this));
        $(this.object).find("#projortho").change(this.update_projection.bind(this));

        $(this.object).find("#voxline_show").change(function() {
            viewopts.voxlines = $(this.object).find("#voxline_show")[0].checked;
            this.setVoxView(this.active.filter, viewopts.voxlines);
            this.schedule();
        }.bind(this));
        $(this.object).find("#voxline_color").minicolors({ close: function(hex, rgb) {
            this.uniforms.voxlineColor.value.set(rgb.r / 255, rgb.g / 255, rgb.b/255);
            this.schedule();
        }.bind(this)});
        $(this.object).find("#voxline_width").slider({ min:.001, max:.1, step:.001, value:viewopts.voxline_width, slide:function(event, ui) {
            this.uniforms.voxlineWidth.value = ui.value;
            this.schedule();
        }.bind(this)});
        $(this.object).find("#datainterp").change(function() {
            this.setVoxView($(this.object).find("#datainterp").val(), viewopts.voxlines);
            this.schedule();
        }.bind(this));
        $(this.object).find("#thicklayers").slider({ min:1, max:32, step:1, value:1, slide:function(event, ui)  {
            if (ui.value == 1)
                $(this.object).find("#thickmix_row").show();
            else 
                $(this.object).find("#thickmix_row").hide();
            this.uniforms.nsamples.value = ui.value;
            this.active.init(this.uniforms, this.meshes, this.flatlims !== undefined, this.frames);
            this.schedule();
        }.bind(this)});
        $(this.object).find("#thickmix").slider({ min:0, max:1, step:.001, value:0.5, slide:function(event, ui) {
            this.figure.notify("setdepth", this, [ui.value]);
            this.uniforms.thickmix.value = ui.value;
            this.schedule();
        }.bind(this)})

        $(this.object).find("#resetflat").click(function() {
            this.reset_view();
        }.bind(this));

        //Dataset box
        var setdat = function(event, ui) {
            var names = [];
            $(this.object).find("#datasets li.ui-selected").each(function() { names.push($(this).text()); });
            this.setData(names);
        }.bind(this)
        $(this.object).find("#datasets")
            .sortable({ 
                handle: ".handle",
                stop: setdat,
             })
            .selectable({
                selecting: function(event, ui) {
                    var selected = $(this.object).find("#datasets li.ui-selected, #datasets li.ui-selecting");
                    if (selected.length > 2) {
                        $(ui.selecting).removeClass("ui-selecting");
                    }
                }.bind(this),
                unselected: function(event, ui) {
                    var selected = $(this.object).find("#datasets li.ui-selected, #datasets li.ui-selecting");
                    if (selected.length < 1) {
                        $(ui.unselected).addClass("ui-selected");
                    }
                }.bind(this),
                stop: setdat,
            });

        $(this.object).find("#moviecontrol").click(this.playpause.bind(this));

        $(this.object).find("#movieprogress>div").slider({min:0, max:1, step:.001,
            slide: function(event, ui) { 
                this.setFrame(ui.value); 
                this.figure.notify("setFrame", this, [ui.value]);
            }.bind(this)
        });
        $(this.object).find("#movieprogress>div").append("<div class='ui-slider-range ui-widget-header'></div>");

        $(this.object).find("#movieframe").change(function() { 
            _this.setFrame(this.value); 
            _this.figure.notify("setFrame", _this, [this.value]);
        });*/
    };
    module.Viewer.prototype._makeBtns = function(names) {
        var btnspeed = 0.5; // How long should folding/unfolding animations take?
        var td, btn, name;
        td = document.createElement("td");
        btn = document.createElement("button");
        btn.setAttribute("title", "Reset to fiducial view of the brain (Hotkey: R)");
        btn.innerHTML = "Fiducial";
        td.setAttribute("style", "text-align:left;width:150px;");
        btn.addEventListener("click", function() {
            this.animate([{idx:btnspeed, state:"target", value:[0,0,0]},
                          {idx:btnspeed, state:"mix", value:0.0}]);
        }.bind(this));
        td.appendChild(btn);
        $(this.object).find("#mixbtns").append(td);

        var nameoff = this.flatlims === undefined ? 0 : 1;
        for (var i = 0; i < names.length; i++) {
            name = names[i][0].toUpperCase() + names[i].slice(1);
            td = document.createElement("td");
            btn = document.createElement("button");
            btn.innerHTML = name;
            btn.setAttribute("title", "Switch to the "+name+" view of the brain");

            btn.addEventListener("click", function(j) {
                this.animate([{idx:btnspeed, state:"mix", value: (j+1) / (names.length+nameoff)}]);
            }.bind(this, i));
            td.appendChild(btn);
            $(this.object).find("#mixbtns").append(td);
        }

        if (this.flatlims !== undefined) {
            td = document.createElement("td");
            btn = document.createElement("button");
            btn.innerHTML = "Flat";
            btn.setAttribute("title", "Switch to the flattened view of the brain (Hotkey: F)");
            td.setAttribute("style", "text-align:right;width:150px;");
            btn.addEventListener("click", function() {
                this.animate([{idx:btnspeed, state:"mix", value:1.0}]);
            }.bind(this));
            td.appendChild(btn);
            $(this.object).find("#mixbtns").append(td);
        }

        $(this.object).find("#mix, #pivot, #shifthemis").parent().attr("colspan", names.length+2);
    };

    return module;
}(mriview || {}));
